#!/usr/bin/env python3
"""Create review-ready publication packages from topic briefs."""

from __future__ import annotations

import argparse
import csv
import html
import json
import re
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_OUTPUT = Path("youtube-library-output")


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8-sig"))


def write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def clean_text(value: Any) -> str:
    if value is None:
        return ""
    text = " ".join(str(value).split())
    return text


def slugify(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    ascii_text = normalized.encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", ascii_text).strip("-").lower()
    return slug or "articulo"


def select_briefs(records_dir: Path, min_score: int, limit: int, ready_only: bool) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for path in sorted(records_dir.glob("*.json")):
        record = read_json(path)
        score = int(record.get("publication_score") or 0)
        if score < min_score:
            continue
        if ready_only and record.get("status") != "ready_for_human_editor":
            continue
        record["_brief_path"] = str(path).replace("\\", "/")
        records.append(record)
    records.sort(
        key=lambda item: (
            -int(item.get("publication_score") or 0),
            -int(item.get("owned_tixuz_video_count") or 0),
            clean_text(item.get("topic")).casefold(),
        )
    )
    return records[:limit] if limit else records


def load_available_details(output: Path) -> set[str]:
    ids: set[str] = set()
    detail_dirs = [
        output / "details",
        output / "knowledge" / "details",
    ]
    external_root = output / "external"
    if external_root.exists():
        detail_dirs.extend(sorted(external_root.glob("*/details")))
    for detail_dir in detail_dirs:
        if not detail_dir.exists():
            continue
        for path in detail_dir.glob("*.json"):
            try:
                detail = read_json(path)
            except Exception:
                continue
            if detail.get("title") or detail.get("id") or detail.get("webpage_url") or detail.get("duration"):
                ids.add(path.stem)
    return ids


def source_rows(record: dict[str, Any], details_available: set[str] | None = None) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    seen = set()

    for video in record.get("owned_tixuz_videos") or []:
        url = clean_text(video.get("url"))
        if not url or url in seen:
            continue
        seen.add(url)
        rows.append({
            "type": "owned_tixuz_video",
            "channel": "Tixuz",
            "title": clean_text(video.get("title")),
            "url": url,
            "usage": "owned-primary",
            "verification": "transcript_available" if video.get("transcript_available") else "needs_transcript_or_manual_review",
        })

    for claim in record.get("selected_claims") or []:
        url = clean_text(claim.get("source_url"))
        if not url or url in seen:
            continue
        seen.add(url)
        video_id = clean_text(claim.get("source_video_id"))
        verification = "needs_editorial_review"
        if details_available is not None and video_id and video_id not in details_available:
            verification = "needs_access_or_metadata_review"
        rows.append({
            "type": "external_reference",
            "channel": clean_text(claim.get("source_channel")),
            "title": clean_text(claim.get("source_title")),
            "url": url,
            "usage": clean_text(claim.get("reuse_policy")) or "embed_link_and_summarize_only",
            "verification": verification,
        })
    return rows


def video_is_embeddable(video: dict[str, Any], details_available: set[str] | None) -> bool:
    usage = clean_text(video.get("usage"))
    video_id = clean_text(video.get("video_id"))
    if usage == "owned-primary":
        return True
    if details_available is None:
        return True
    return bool(video_id and video_id in details_available)


def make_schema(record: dict[str, Any], canonical_base: str, details_available: set[str] | None = None) -> dict[str, Any]:
    topic = clean_text(record.get("topic"))
    slug = clean_text(record.get("slug")) or slugify(topic)
    canonical = f"{canonical_base.rstrip('/')}/guias/{slug}/"
    title = f"{topic}: guia de compra Tixuz"
    videos = []

    for video in record.get("videos_to_embed") or []:
        if not video_is_embeddable(video, details_available):
            continue
        video_id = clean_text(video.get("video_id"))
        if not video_id:
            continue
        videos.append({
            "@type": "VideoObject",
            "name": clean_text(video.get("title")),
            "description": f"Fuente de video usada como referencia editorial para la guia Tixuz sobre {topic}.",
            "embedUrl": f"https://www.youtube.com/embed/{video_id}",
            "url": clean_text(video.get("url")),
            "publisher": {
                "@type": "Organization",
                "name": clean_text(video.get("channel")) or "YouTube",
            },
        })

    return {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "Article",
                "headline": title,
                "description": f"Borrador editorial de Tixuz Autos sobre {topic}: videos propios, fuentes externas atribuidas y preguntas de compra.",
                "inLanguage": "es-MX",
                "isAccessibleForFree": True,
                "url": canonical,
                "author": {
                    "@type": "Person",
                    "name": "Eduardo Vargas",
                },
                "publisher": {
                    "@type": "Organization",
                    "name": "Tixuz Autos",
                    "url": canonical_base.rstrip("/"),
                    "sameAs": [
                        "https://www.youtube.com/channel/UCx-BX1_MDzK1v3qRvsHBOTg",
                        "https://www.youtube.com/c/Tixuz",
                    ],
                },
                "about": {
                    "@type": "Brand",
                    "name": topic,
                },
                "video": videos,
            },
            {
                "@type": "BreadcrumbList",
                "itemListElement": [
                    {
                        "@type": "ListItem",
                        "position": 1,
                        "name": "Tixuz Autos",
                        "item": canonical_base.rstrip("/"),
                    },
                    {
                        "@type": "ListItem",
                        "position": 2,
                        "name": "Guias",
                        "item": f"{canonical_base.rstrip('/')}/guias/",
                    },
                    {
                        "@type": "ListItem",
                        "position": 3,
                        "name": topic,
                        "item": canonical,
                    },
                ],
            },
        ],
    }


def article_markdown(record: dict[str, Any], canonical_base: str, details_available: set[str] | None = None) -> str:
    topic = clean_text(record.get("topic"))
    slug = clean_text(record.get("slug")) or slugify(topic)
    canonical = f"{canonical_base.rstrip('/')}/guias/{slug}/"
    title = f"{topic}: guia de compra Tixuz"
    status = clean_text(record.get("status"))
    score = int(record.get("publication_score") or 0)
    owned_count = int(record.get("owned_tixuz_video_count") or 0)
    selected_count = int(record.get("selected_claim_count") or 0)

    lines = [
        "---",
        f"title: \"{title}\"",
        f"slug: \"{slug}\"",
        "status: \"draft_needs_editorial_review\"",
        f"canonical: \"{canonical}\"",
        f"publication_score: {score}",
        "---",
        "",
        f"# {title}",
        "",
        f"Este es un borrador editorial de trabajo. Parte de {owned_count} video(s) propios de Tixuz y {selected_count} referencia(s) externas atribuidas. Antes de publicarlo hay que revisar transcripciones, confirmar datos actuales y reescribir cualquier opinion como criterio editorial propio.",
        "",
        "## Video base",
    ]

    owned_videos = record.get("owned_tixuz_videos") or []
    if owned_videos:
        for video in owned_videos[:3]:
            title_video = clean_text(video.get("title"))
            url = clean_text(video.get("url"))
            transcript_note = "con transcripcion disponible" if video.get("transcript_available") else "pendiente de transcripcion"
            lines.append(f"- [{title_video}]({url}) - Tixuz, {transcript_note}.")
    else:
        lines.append("- No se detecto video propio principal para este tema; usar solo como brief de investigacion hasta encontrar uno.")

    lines.extend([
        "",
        f"## Que representa {topic} para un comprador",
        "",
        f"{topic} aparece como tema con suficiente material para una guia de compra, pero este paquete no debe tratarse como articulo final todavia. La version publicable debe explicar para quien tiene sentido la marca, que versiones conviene revisar, cuales son los puntos debiles y que alternativas compiten directamente en Mexico.",
        "",
        "## Puntos que debe resolver el editor",
    ])

    for question in record.get("buyer_questions") or []:
        lines.append(f"- {clean_text(question)}")

    polarity = record.get("polarity") or {}
    lines.extend([
        "",
        "## Lectura preliminar de las fuentes",
        "",
        f"- Señales neutrales o informativas: {polarity.get('neutral', 0)}",
        f"- Señales favorables: {polarity.get('positive', 0)}",
        f"- Señales criticas: {polarity.get('negative', 0)}",
        "",
        "Estas señales no son conclusiones. Son marcadores para que un editor revise los videos, separe opinion de dato verificable y convierta el material en criterio de compra claro.",
        "",
        "## Fuentes externas para revisar",
    ])

    for source in source_rows(record, details_available):
        if source["type"] == "owned_tixuz_video":
            continue
        lines.append(f"- [{source['channel']} - {source['title']}]({source['url']}) ({source['usage']}; {source['verification']}).")

    lines.extend([
        "",
        "## Estructura propuesta del articulo",
    ])
    for index, item in enumerate(record.get("article_outline") or [], start=1):
        lines.append(f"{index}. {clean_text(item)}")

    lines.extend([
        "",
        "## Checklist antes de publicar",
        "",
        "- Confirmar transcripcion o revision manual del video propio principal.",
        "- Verificar datos de precios, disponibilidad y versiones actuales.",
        "- No copiar frases de videos externos; usar cita/enlace/embed y redaccion propia.",
        "- Convertir cada afirmacion fuerte en dato verificable o opinion atribuida.",
        "- Agregar enlaces internos a inventario, comparativas y fichas relacionadas de Tixuz.",
        "- Revisar que el schema Article y VideoObject coincida con los embeds reales.",
        "",
        "## Estado",
        "",
        f"- Brief original: {status}",
        f"- Puntaje de publicacion: {score}/100",
        "- Estado de este archivo: borrador local, no publicar sin revision.",
    ])
    return "\n".join(lines) + "\n"


def article_html(markdown_text: str, record: dict[str, Any], schema: dict[str, Any], details_available: set[str] | None = None) -> str:
    topic = clean_text(record.get("topic"))
    videos = record.get("videos_to_embed") or []
    source_list = source_rows(record, details_available)
    schema_json = json.dumps(schema, ensure_ascii=False, indent=2).replace("</", "<\\/")

    body = [
        "<!doctype html>",
        "<html lang=\"es-MX\">",
        "<head>",
        "  <meta charset=\"utf-8\">",
        "  <meta name=\"robots\" content=\"noindex,nofollow\">",
        f"  <title>{html.escape(topic)}: guia de compra Tixuz</title>",
        "  <script type=\"application/ld+json\">",
        schema_json,
        "  </script>",
        "  <style>body{font-family:Arial,sans-serif;max-width:980px;margin:40px auto;padding:0 20px;line-height:1.55;color:#17202a}iframe{width:100%;aspect-ratio:16/9;border:0}.notice{background:#fff7d6;border-left:4px solid #e2b203;padding:12px 16px}.source{border-top:1px solid #e5e7eb;padding:10px 0}.meta{color:#52606d}</style>",
        "</head>",
        "<body>",
        f"  <h1>{html.escape(topic)}: guia de compra Tixuz</h1>",
        "  <p class=\"notice\">Borrador local de revision. No publicar sin verificacion editorial.</p>",
        f"  <p>{html.escape(clean_text(record.get('angle')))}</p>",
        "  <h2>Videos para incrustar</h2>",
    ]

    embedded_count = 0
    for video in videos:
        if not video_is_embeddable(video, details_available):
            continue
        video_id = clean_text(video.get("video_id"))
        if not video_id:
            continue
        body.append(f"  <h3>{html.escape(clean_text(video.get('title')))}</h3>")
        body.append(f"  <p class=\"meta\">{html.escape(clean_text(video.get('channel')))} - {html.escape(clean_text(video.get('usage')))}</p>")
        body.append(f"  <iframe src=\"https://www.youtube.com/embed/{html.escape(video_id)}\" loading=\"lazy\" allowfullscreen></iframe>")
        embedded_count += 1
        if embedded_count >= 5:
            break

    body.extend([
        "  <h2>Preguntas que debe responder el articulo</h2>",
        "  <ul>",
    ])
    for question in record.get("buyer_questions") or []:
        body.append(f"    <li>{html.escape(clean_text(question))}</li>")
    body.extend(["  </ul>", "  <h2>Fuentes</h2>"])

    for source in source_list:
        body.append("  <div class=\"source\">")
        body.append(f"    <strong>{html.escape(source['channel'])}</strong>: <a href=\"{html.escape(source['url'])}\">{html.escape(source['title'])}</a>")
        body.append(f"    <p class=\"meta\">{html.escape(source['type'])} - {html.escape(source['verification'])}</p>")
        body.append("  </div>")

    body.extend([
        "  <h2>Markdown editorial</h2>",
        f"  <pre>{html.escape(markdown_text)}</pre>",
        "</body>",
        "</html>",
    ])
    return "\n".join(body) + "\n"


def checklist_text(record: dict[str, Any], details_available: set[str] | None = None) -> str:
    topic = clean_text(record.get("topic"))
    rows = source_rows(record, details_available)
    missing_owned = [row for row in rows if row["type"] == "owned_tixuz_video" and row["verification"] != "transcript_available"]
    missing_external = [row for row in rows if row["type"] == "external_reference" and row["verification"] == "needs_access_or_metadata_review"]
    lines = [
        f"# Checklist de publicacion: {topic}",
        "",
        "## Bloqueos antes de publicar",
    ]
    if missing_owned:
        lines.append("- Falta transcripcion o revision manual en video(s) propios:")
        for row in missing_owned:
            lines.append(f"  - {row['title']} - {row['url']}")
    else:
        lines.append("- No hay bloqueo de transcripcion propia detectado.")
    if missing_external:
        lines.append("- Fuente(s) externa(s) sin metadatos completos o con posible restriccion de acceso:")
        for row in missing_external:
            lines.append(f"  - {row['channel']} - {row['title']} - {row['url']}")

    lines.extend([
        "",
        "## Revisión editorial",
        "- Redactar introduccion original con voz Tixuz.",
        "- Convertir los videos externos en referencias atribuidas, no en texto copiado.",
        "- Verificar precios, versiones y disponibilidad actual antes del deploy.",
        "- Añadir enlaces internos a inventario y fichas relacionadas.",
        "- Revisar schema JSON-LD contra el HTML final.",
        "",
        "## Estado recomendado",
        "Mantener como borrador local hasta completar los puntos anteriores.",
    ])
    return "\n".join(lines) + "\n"


def agent_prompt(record: dict[str, Any], details_available: set[str] | None = None) -> str:
    topic = clean_text(record.get("topic"))
    sources = source_rows(record, details_available)
    lines = [
        f"# Prompt para agente redactor: {topic}",
        "",
        "Rol: actua como editor automotriz SEO/GEO para Tixuz Autos. Tu tarea es convertir este paquete en un borrador original y verificable, no copiar transcripciones ni frases de terceros.",
        "",
        "Reglas obligatorias:",
        "- Escribe en español de Mexico.",
        "- No inventes precios, versiones ni disponibilidad; marca como pendiente lo que no puedas verificar.",
        "- Usa videos externos solo como referencia atribuida con enlace o embed.",
        "- No copies guiones ni transcripciones completas.",
        "- Separa opinion atribuida, dato verificable y criterio editorial de Tixuz.",
        "- Devuelve el resultado en Markdown con titulo, meta description, articulo, FAQ y lista de fuentes.",
        "",
        f"Tema: {topic}",
        f"Angulo: {clean_text(record.get('angle'))}",
        "",
        "Preguntas que debe responder:",
    ]
    for question in record.get("buyer_questions") or []:
        lines.append(f"- {clean_text(question)}")
    lines.extend(["", "Fuentes permitidas:"])
    for source in sources:
        lines.append(f"- {source['type']} | {source['channel']} | {source['title']} | {source['url']} | {source['usage']} | {source['verification']}")
    lines.extend([
        "",
        "Formato de salida:",
        "1. Titulo SEO",
        "2. Meta description",
        "3. Articulo en Markdown",
        "4. FAQ de 5 preguntas",
        "5. Tabla de fuentes con uso recomendado",
        "6. Lista de verificaciones pendientes",
    ])
    return "\n".join(lines) + "\n"


def write_sources_csv(path: Path, rows: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = ["type", "channel", "title", "url", "usage", "verification"]
    with path.open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow(row)


def main() -> None:
    parser = argparse.ArgumentParser(description="Create publication packages from local Tixuz topic briefs.")
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT))
    parser.add_argument("--brief-records-dir", help="Path to knowledge/briefs/records.")
    parser.add_argument("--packages-dir", help="Output directory for packages.")
    parser.add_argument("--canonical-base", default="https://tixuzautos.com")
    parser.add_argument("--min-score", type=int, default=70)
    parser.add_argument("--limit", type=int, default=5)
    parser.add_argument("--ready-only", action="store_true")
    args = parser.parse_args()

    output = Path(args.output)
    records_dir = Path(args.brief_records_dir) if args.brief_records_dir else output / "knowledge" / "briefs" / "records"
    packages_dir = Path(args.packages_dir) if args.packages_dir else output / "knowledge" / "publication-packages"

    selected = select_briefs(records_dir, args.min_score, args.limit, args.ready_only)
    details_available = load_available_details(output)
    index_rows: list[dict[str, Any]] = []

    for record in selected:
        topic = clean_text(record.get("topic"))
        slug = clean_text(record.get("slug")) or slugify(topic)
        package_dir = packages_dir / slug
        schema = make_schema(record, args.canonical_base, details_available)
        markdown = article_markdown(record, args.canonical_base, details_available)
        html_text = article_html(markdown, record, schema, details_available)
        rows = source_rows(record, details_available)

        package = {
            "topic": topic,
            "slug": slug,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "source_brief": record.get("_brief_path"),
            "status": "draft_needs_editorial_review",
            "publication_score": int(record.get("publication_score") or 0),
            "owned_tixuz_video_count": int(record.get("owned_tixuz_video_count") or 0),
            "selected_claim_count": int(record.get("selected_claim_count") or 0),
            "canonical": f"{args.canonical_base.rstrip('/')}/guias/{slug}/",
            "files": {
                "article_markdown": "article.md",
                "article_html": "article.html",
                "schema": "schema.json",
                "sources": "sources.csv",
                "checklist": "checklist.md",
                "agent_prompt": "agent-prompt.md",
            },
        }

        write_json(package_dir / "data.json", package)
        write_json(package_dir / "schema.json", schema)
        write_text(package_dir / "article.md", markdown)
        write_text(package_dir / "article.html", html_text)
        write_text(package_dir / "checklist.md", checklist_text(record, details_available))
        write_text(package_dir / "agent-prompt.md", agent_prompt(record, details_available))
        write_sources_csv(package_dir / "sources.csv", rows)

        index_rows.append(package)

    packages_dir.mkdir(parents=True, exist_ok=True)
    write_json(packages_dir / "index.json", index_rows)
    with (packages_dir / "index.csv").open("w", newline="", encoding="utf-8-sig") as handle:
        fieldnames = ["topic", "slug", "status", "publication_score", "owned_tixuz_video_count", "selected_claim_count", "canonical"]
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for row in index_rows:
            writer.writerow({field: row.get(field, "") for field in fieldnames})

    print(json.dumps({
        "packages": len(index_rows),
        "packages_dir": str(packages_dir),
        "index": str(packages_dir / "index.json"),
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
