#!/usr/bin/env python3
"""Materialize enriched records as JSON, Markdown, HTML, and indexes."""

from __future__ import annotations

import argparse
import csv
import html
import json
import re
import shutil
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def slugify(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", normalized.lower()).strip("-")
    return re.sub(r"-{2,}", "-", slug)[:90] or "video"


def load_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8-sig"))


def first_existing(*paths: Path) -> dict[str, Any]:
    for path in paths:
        if path.exists():
            return load_json(path, {})
    return {}


def ensure_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def source_context(video: dict[str, Any], details: dict[str, Any], enriched: dict[str, Any]) -> dict[str, Any]:
    source = video.get("source") if isinstance(video.get("source"), dict) else {}
    source = {**source, **(enriched.get("source") if isinstance(enriched.get("source"), dict) else {})}
    usage_rights = source.get("usage_rights") or "owned"
    source_name = source.get("source_name") or details.get("channel") or video.get("channel") or "Tixuz Autos"
    source_url = source.get("source_url") or details.get("channel_url") or video.get("url") or ""
    permission_required = usage_rights == "external-reference"
    return {
        "source_key": source.get("source_key") or "tixuz",
        "source_name": source_name,
        "source_owner": source.get("source_owner") or details.get("channel") or "",
        "source_url": source_url,
        "source_channel_id": source.get("source_channel_id") or details.get("channel_id") or "",
        "usage_rights": usage_rights,
        "relationship": source.get("relationship") or "owned-channel",
        "permission_note": source.get("permission_note") or "",
        "reuse_policy": source.get("reuse_policy") or ("embed_link_and_summarize_only" if permission_required else "full_reuse_allowed"),
        "transcript_policy": source.get("transcript_policy")
        or ("do_not_store_full_transcript_without_permission" if permission_required else "store_full_transcript"),
        "editorial_permission_required": permission_required,
    }


def md_list(items: list[Any]) -> str:
    if not items:
        return "- Pendiente de enriquecer.\n"
    return "".join(f"- {item if isinstance(item, str) else json.dumps(item, ensure_ascii=False)}\n" for item in items)


def record_for_video(video: dict[str, Any], output: Path) -> dict[str, Any]:
    video_id = video.get("id")
    details = load_json(output / "details" / f"{video_id}.json", {})
    transcript = load_json(output / "transcripts" / f"{video_id}.json", {})
    claims_record = load_json(output / "claims" / f"{video_id}.json", {})
    enriched = first_existing(
        output / "enriched-ai" / f"{video_id}.json",
        output / "enriched-ai-strict" / f"{video_id}.json",
        output / "enriched" / f"{video_id}.json",
    )
    title = enriched.get("title_seo") or details.get("title") or video.get("title") or video_id
    slug = enriched.get("slug") or f"{slugify(title)}-{video_id}"
    source = source_context(video, details, enriched)
    editorial_warnings = ensure_list(enriched.get("editorial_warnings") or enriched.get("verification_notes"))
    if source["editorial_permission_required"]:
        editorial_warnings.append(
            "Fuente externa: publicar como resumen con embed/enlace y atribucion; no republicar transcripcion completa sin permiso."
        )
    return {
        "id": video_id,
        "slug": slug,
        "source_url": enriched.get("source_url") or video.get("url"),
        "source_context": source,
        "usage_rights": source["usage_rights"],
        "reuse_policy": source["reuse_policy"],
        "transcript_policy": source["transcript_policy"],
        "editorial_permission_required": source["editorial_permission_required"],
        "title_original": details.get("title") or video.get("title") or "",
        "title_seo": title,
        "meta_description": enriched.get("meta_description") or (enriched.get("summary") or "")[:155],
        "executive_summary": enriched.get("executive_summary") or enriched.get("summary") or "",
        "key_takeaways": ensure_list(enriched.get("key_takeaways") or enriched.get("key_points")),
        "vehicles_or_brands": ensure_list(enriched.get("vehicles_or_brands") or enriched.get("vehicle_entities")),
        "buyer_questions_answered": ensure_list(enriched.get("buyer_questions_answered") or enriched.get("buyer_intent")),
        "market_topics": ensure_list(enriched.get("market_topics") or enriched.get("detected_topics")),
        "publishable_article_outline": ensure_list(enriched.get("publishable_article_outline")),
        "internal_links_to_create": ensure_list(enriched.get("internal_links_to_create")),
        "schema_org_notes": ensure_list(enriched.get("schema_org_notes")),
        "external_claims": ensure_list(claims_record.get("claims")),
        "claims_count": len(ensure_list(claims_record.get("claims"))),
        "claims_extraction_provider": claims_record.get("extraction_provider"),
        "editorial_warnings": editorial_warnings,
        "duration": details.get("duration") or video.get("duration"),
        "upload_date": details.get("upload_date"),
        "thumbnail": details.get("thumbnail") or video.get("thumbnail"),
        "transcript_language": transcript.get("language_code"),
        "transcript_is_generated": transcript.get("is_generated"),
        "transcript_available": bool(transcript.get("text")),
        "transcript_chars": len(transcript.get("text") or ""),
        "enrichment_provider": enriched.get("enrichment_provider") or enriched.get("model") or "local",
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


def markdown(record: dict[str, Any]) -> str:
    source = record.get("source_context", {})
    return f"""# {record['title_seo']}

Fuente: {record['source_url']}
Canal/Fuente: {source.get('source_name', 'Tixuz Autos')}
Uso: {record.get('reuse_policy', 'full_reuse_allowed')}

## Resumen

{record.get('executive_summary') or 'Pendiente de enriquecer.'}

## Puntos clave

{md_list(record.get('key_takeaways', []))}
## Autos, marcas o modelos mencionados

{md_list(record.get('vehicles_or_brands', []))}
## Preguntas de comprador que responde

{md_list(record.get('buyer_questions_answered', []))}
## Temas de mercado

{md_list(record.get('market_topics', []))}
## Afirmaciones y opiniones atribuidas

{md_list([claim.get('claim_summary', '') if isinstance(claim, dict) else claim for claim in record.get('external_claims', [])])}
## Estructura sugerida para publicar

{md_list(record.get('publishable_article_outline', []))}
## Notas editoriales

{md_list(record.get('editorial_warnings', []))}
"""


def html_doc(record: dict[str, Any]) -> str:
    source = record.get("source_context", {})
    schema = {
        "@context": "https://schema.org",
        "@type": "VideoObject",
        "name": record["title_seo"],
        "description": record.get("meta_description") or record.get("executive_summary") or "",
        "thumbnailUrl": [record["thumbnail"]] if record.get("thumbnail") else [],
        "uploadDate": record.get("upload_date") or "",
        "contentUrl": record.get("source_url"),
        "publisher": {"@type": "Organization", "name": source.get("source_name") or "Tixuz Autos"},
    }
    def list_html(items: list[Any]) -> str:
        return "<ul>" + "".join(f"<li>{html.escape(item if isinstance(item, str) else json.dumps(item, ensure_ascii=False))}</li>" for item in items) + "</ul>"

    return f"""<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>{html.escape(record['title_seo'])}</title>
  <meta name="description" content="{html.escape(record.get('meta_description') or '')}">
  <script type="application/ld+json">{html.escape(json.dumps(schema, ensure_ascii=False))}</script>
  <style>
    body {{ font-family: Arial, sans-serif; max-width: 860px; margin: 40px auto; line-height: 1.55; color: #202124; }}
    h1 {{ font-size: 34px; line-height: 1.15; }}
    h2 {{ margin-top: 32px; }}
    a {{ color: #0b57d0; }}
    .meta {{ color: #5f6368; }}
  </style>
</head>
<body>
  <main>
    <h1>{html.escape(record['title_seo'])}</h1>
    <p class="meta"><a href="{html.escape(record.get('source_url') or '')}">Video original en YouTube</a></p>
    <p class="meta">Fuente: {html.escape(source.get('source_name') or 'Tixuz Autos')} · Uso: {html.escape(record.get('reuse_policy') or 'full_reuse_allowed')}</p>
    <h2>Resumen</h2>
    <p>{html.escape(record.get('executive_summary') or 'Pendiente de enriquecer.')}</p>
    <h2>Puntos clave</h2>
    {list_html(record.get('key_takeaways', []))}
    <h2>Autos, marcas o modelos mencionados</h2>
    {list_html(record.get('vehicles_or_brands', []))}
    <h2>Preguntas de comprador que responde</h2>
    {list_html(record.get('buyer_questions_answered', []))}
    <h2>Temas de mercado</h2>
    {list_html(record.get('market_topics', []))}
    <h2>Afirmaciones y opiniones atribuidas</h2>
    {list_html([claim.get('claim_summary', '') if isinstance(claim, dict) else claim for claim in record.get('external_claims', [])])}
    <h2>Notas editoriales</h2>
    {list_html(record.get('editorial_warnings', []))}
  </main>
</body>
</html>
"""


def main() -> None:
    parser = argparse.ArgumentParser(description="Export fichas to local publishable files.")
    parser.add_argument("--catalog", default="youtube-library-output/catalog/videos.json")
    parser.add_argument("--output", default="youtube-library-output")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--start", type=int, default=0)
    parser.add_argument("--only-enriched", action="store_true")
    parser.add_argument("--clean", action="store_true", help="Clear the generated fichas directory before exporting.")
    args = parser.parse_args()

    output = Path(args.output)
    catalog = load_json(Path(args.catalog), {})
    videos = catalog.get("videos", [])
    if args.start:
        videos = videos[args.start :]
    if args.limit:
        videos = videos[: args.limit]

    export_dir = output / "fichas"
    if args.clean and export_dir.exists():
        shutil.rmtree(export_dir)
    records_dir = export_dir / "records"
    md_dir = export_dir / "markdown"
    html_dir = export_dir / "html"
    for directory in (records_dir, md_dir, html_dir):
        directory.mkdir(parents=True, exist_ok=True)

    records = []
    for video in videos:
        video_id = video.get("id")
        if not video_id:
            continue
        if args.only_enriched and not any(
            (output / folder / f"{video_id}.json").exists()
            for folder in ("enriched-ai", "enriched-ai-strict", "enriched")
        ):
            continue
        record = record_for_video(video, output)
        records.append(record)
        records_dir.joinpath(f"{video_id}.json").write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")
        md_dir.joinpath(f"{record['slug']}.md").write_text(markdown(record), encoding="utf-8")
        html_dir.joinpath(f"{record['slug']}.html").write_text(html_doc(record), encoding="utf-8")

    export_dir.joinpath("index.json").write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8")
    with export_dir.joinpath("index.csv").open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "id",
                "slug",
                "title_seo",
                "source_url",
                "source_name",
                "usage_rights",
                "reuse_policy",
                "editorial_permission_required",
                "upload_date",
                "duration",
                "transcript_available",
                "transcript_chars",
                "claims_count",
                "enrichment_provider",
            ],
        )
        writer.writeheader()
        for record in records:
            row = {key: record.get(key) for key in writer.fieldnames}
            row["source_name"] = (record.get("source_context") or {}).get("source_name")
            writer.writerow(row)

    print(json.dumps({"fichas_exported": len(records), "export_dir": str(export_dir)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
