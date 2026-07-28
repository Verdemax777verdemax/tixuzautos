#!/usr/bin/env python3
"""Create editorial topic briefs from owned fichas and external claims."""

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
MOJIBAKE_MARKERS = ("Ã", "Â", "ðŸ", "â€", "â€œ", "â€˜", "ï¸")


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8-sig"))


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def repair_text(value: Any) -> str:
    if value is None:
        return ""
    text = " ".join(str(value).split())
    if not any(marker in text for marker in MOJIBAKE_MARKERS):
        return text
    try:
        fixed = text.encode("latin1", errors="ignore").decode("utf-8", errors="ignore")
    except Exception:
        return text
    original_score = sum(text.count(marker) for marker in MOJIBAKE_MARKERS)
    fixed_score = sum(fixed.count(marker) for marker in MOJIBAKE_MARKERS)
    return fixed if fixed and fixed_score < original_score else text


def slugify(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    ascii_text = normalized.encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", ascii_text).strip("-").lower()
    return slug or "tema"


def load_owned_records(records_dir: Path) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    if not records_dir.exists():
        return records
    for path in sorted(records_dir.glob("*.json")):
        try:
            item = read_json(path)
            item["_record_path"] = str(path).replace("\\", "/")
            records.append(item)
        except Exception:
            continue
    return records


def flatten_values(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        return [value]
    if isinstance(value, dict):
        texts: list[str] = []
        for item in value.values():
            texts.extend(flatten_values(item))
        return texts
    if isinstance(value, list):
        texts = []
        for item in value:
            texts.extend(flatten_values(item))
        return texts
    return [str(value)]


def topic_in_owned_record(topic: str, record: dict[str, Any]) -> bool:
    haystack_parts = [
        record.get("title_original"),
        record.get("title_seo"),
        record.get("meta_description"),
        record.get("executive_summary"),
        " ".join(flatten_values(record.get("key_takeaways"))),
        " ".join(flatten_values(record.get("vehicles_or_brands"))),
        " ".join(flatten_values(record.get("market_topics"))),
    ]
    haystack = repair_text(" ".join(part for part in haystack_parts if part)).casefold()
    return topic.casefold() in haystack


def best_owned_records(topic: str, owned_records: list[dict[str, Any]], limit: int) -> list[dict[str, Any]]:
    matches = []
    for record in owned_records:
        if not topic_in_owned_record(topic, record):
            continue
        score = 0
        title = repair_text(record.get("title_original")).casefold()
        summary = repair_text(record.get("executive_summary")).casefold()
        if topic.casefold() in title:
            score += 6
        if record.get("transcript_available"):
            score += 4
        if summary:
            score += 2
        score += min(int(record.get("transcript_chars") or 0) // 4000, 4)
        matches.append((score, record))
    matches.sort(key=lambda item: (-item[0], repair_text(item[1].get("title_original")).casefold()))
    return [record for _, record in matches[:limit]]


def topic_angle(topic: str, data: dict[str, Any], owned_count: int) -> str:
    polarity = data.get("polarity") or {}
    positive = int(polarity.get("positive") or 0)
    negative = int(polarity.get("negative") or 0)
    neutral = int(polarity.get("neutral") or 0)
    if owned_count:
        return f"Guia de compra sobre {topic} apoyada primero en videos propios de Tixuz y reforzada con referencias externas atribuidas."
    if negative > positive and negative >= neutral:
        return f"Alertas y puntos a revisar antes de comprar un {topic}, usando referencias externas como pistas editoriales."
    if positive > negative and positive >= neutral:
        return f"Fortalezas que compradores suelen considerar en {topic}, con fuentes externas como punto de partida."
    return f"Mapa editorial de {topic}: modelos, dudas frecuentes, reputacion y videos que conviene revisar antes de publicar."


def publication_score(data: dict[str, Any], owned_count: int, selected_claim_count: int) -> int:
    claim_count = min(int(data.get("claim_count") or 0), selected_claim_count + 8)
    source_count = int(data.get("source_count") or 0)
    score = min(claim_count, 30)
    score += min(source_count * 8, 32)
    score += min(owned_count * 12, 36)
    return min(score, 100)


def buyer_questions(topic: str) -> list[str]:
    return [
        f"Que versiones de {topic} convienen mas segun presupuesto y uso?",
        f"Cuales son los puntos debiles de {topic} que debe revisar un comprador?",
        f"Que modelos de {topic} tienen mejor reputacion de confiabilidad?",
        f"Que alternativas reales compiten contra {topic} en Mexico?",
        f"Conviene comprar {topic} nuevo, seminuevo o usado?",
    ]


def article_outline(topic: str, has_owned_video: bool) -> list[str]:
    intro = "Video principal de Tixuz y contexto" if has_owned_video else "Contexto y fuentes revisadas"
    return [
        intro,
        f"Que representa {topic} para el comprador mexicano",
        "Pros mas repetidos en las fuentes",
        "Contras, riesgos y puntos a verificar",
        "Modelos o versiones que merecen revision aparte",
        "Preguntas frecuentes antes de comprar",
        "Veredicto editorial de Tixuz",
    ]


def claim_is_generic_marker(claim: dict[str, Any]) -> bool:
    summary = repair_text(claim.get("claim_summary")).casefold()
    method = repair_text(claim.get("extraction_method")).casefold()
    claim_type = repair_text(claim.get("claim_type")).casefold()
    return (
        "fuente externa registrada" in summary
        or "local_review_marker" in method
        or claim_type == "review_needed"
    )


def claim_relevant_to_topic(topic: str, claim: dict[str, Any]) -> bool:
    topic_key = topic.casefold()
    title = repair_text(claim.get("source_title")).casefold()
    return topic_key in title


def top_claims(topic: str, claims: list[dict[str, Any]], limit: int) -> list[dict[str, Any]]:
    def score(claim: dict[str, Any]) -> tuple[int, str, str]:
        confidence = repair_text(claim.get("confidence")).casefold()
        confidence_score = {"high": 3, "medium": 2, "low": 1}.get(confidence, 0)
        return (
            confidence_score,
            repair_text(claim.get("source_channel")),
            repair_text(claim.get("source_title")),
        )

    deduped: list[dict[str, Any]] = []
    seen = set()
    relevant_claims = [claim for claim in claims if claim_relevant_to_topic(topic, claim)]
    for claim in sorted(relevant_claims, key=score, reverse=True):
        signature = (
            repair_text(claim.get("claim_summary")).casefold(),
            repair_text(claim.get("source_video_id")),
            repair_text(claim.get("polarity")).casefold(),
        )
        if signature in seen:
            continue
        seen.add(signature)
        deduped.append(claim)
        if len(deduped) >= limit:
            break
    return deduped


def video_candidates(claims: list[dict[str, Any]], owned: list[dict[str, Any]], limit: int) -> list[dict[str, str]]:
    videos: list[dict[str, str]] = []
    seen = set()

    for record in owned:
        video_id = repair_text(record.get("id"))
        if not video_id or video_id in seen:
            continue
        seen.add(video_id)
        videos.append({
            "video_id": video_id,
            "url": repair_text(record.get("source_url")),
            "title": repair_text(record.get("title_original")),
            "channel": "Tixuz",
            "usage": "owned-primary",
        })
        if len(videos) >= limit:
            return videos

    for claim in claims:
        video_id = repair_text(claim.get("source_video_id"))
        if not video_id or video_id in seen:
            continue
        seen.add(video_id)
        videos.append({
            "video_id": video_id,
            "url": repair_text(claim.get("source_url")),
            "title": repair_text(claim.get("source_title")),
            "channel": repair_text(claim.get("source_channel")),
            "usage": repair_text(claim.get("reuse_policy")) or "embed_link_and_summarize_only",
        })
        if len(videos) >= limit:
            break
    return videos


def make_record(topic: str, data: dict[str, Any], owned: list[dict[str, Any]], max_claims: int, max_videos: int) -> dict[str, Any]:
    raw_claims = data.get("claims") or []
    claims = top_claims(topic, raw_claims, max_claims)
    videos = video_candidates(claims, owned, max_videos)
    score = publication_score(data, len(owned), len(claims))
    status = "ready_for_human_editor" if score >= 70 and owned else "research_brief_needs_editorial_review"

    return {
        "topic": topic,
        "slug": slugify(topic),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "status": status,
        "publication_score": score,
        "angle": topic_angle(topic, data, len(owned)),
        "claim_count": int(data.get("claim_count") or 0),
        "selected_claim_count": len(claims),
        "source_count": int(data.get("source_count") or 0),
        "sources": data.get("sources") or {},
        "polarity": data.get("polarity") or {},
        "owned_tixuz_video_count": len(owned),
        "owned_tixuz_videos": [
            {
                "id": repair_text(record.get("id")),
                "url": repair_text(record.get("source_url")),
                "title": repair_text(record.get("title_original")),
                "summary": repair_text(record.get("executive_summary")),
                "transcript_available": bool(record.get("transcript_available")),
                "transcript_chars": int(record.get("transcript_chars") or 0),
            }
            for record in owned
        ],
        "buyer_questions": buyer_questions(topic),
        "article_outline": article_outline(topic, bool(owned)),
        "selected_claims": [
            {
                "summary": repair_text(claim.get("claim_summary")),
                "polarity": repair_text(claim.get("polarity")),
                "claim_type": repair_text(claim.get("claim_type")),
                "buyer_impact": repair_text(claim.get("buyer_impact")),
                "confidence": repair_text(claim.get("confidence")),
                "needs_verification": bool(claim.get("needs_verification", True)),
                "source_channel": repair_text(claim.get("source_channel")),
                "source_title": repair_text(claim.get("source_title")),
                "source_url": repair_text(claim.get("source_url")),
                "source_video_id": repair_text(claim.get("source_video_id")),
                "reuse_policy": repair_text(claim.get("reuse_policy")),
                "content_reuse_policy": repair_text(claim.get("content_reuse_policy")),
            }
            for claim in claims
        ],
        "videos_to_embed": videos,
        "editorial_guardrails": [
            "No publicar como articulo final sin revision humana.",
            "No copiar guiones ni transcripciones completas de fuentes externas.",
            "Usar videos externos como cita, enlace o embed con atribucion visible.",
            "Separar opinion atribuida de dato verificable.",
        ],
    }


def markdown_for(record: dict[str, Any]) -> str:
    lines = [
        f"# Guia editorial Tixuz: {record['topic']}",
        "",
        f"Estado: {record['status']}",
        f"Puntaje de publicacion: {record['publication_score']}/100",
        f"Angulo: {record['angle']}",
        "",
        "## Resumen de fuentes",
        f"- Claims disponibles: {record['claim_count']}",
        f"- Claims seleccionados para este brief: {record['selected_claim_count']}",
        f"- Fuentes: {record['source_count']}",
        f"- Videos propios Tixuz detectados: {record['owned_tixuz_video_count']}",
        "",
        "## Fuentes por canal",
    ]
    for source, count in record["sources"].items():
        lines.append(f"- {repair_text(source)}: {count}")

    lines.extend(["", "## Videos principales"])
    for video in record["videos_to_embed"]:
        lines.append(f"- [{video['title']}]({video['url']}) - {video['channel']} ({video['usage']})")

    if record["owned_tixuz_videos"]:
        lines.extend(["", "## Base propia Tixuz"])
        for video in record["owned_tixuz_videos"]:
            lines.append(f"- [{video['title']}]({video['url']})")
            if video["summary"]:
                lines.append(f"  Resumen: {video['summary']}")

    lines.extend(["", "## Claims seleccionados"])
    for claim in record["selected_claims"]:
        review = "requiere verificacion" if claim["needs_verification"] else "verificado"
        lines.append(
            f"- {claim['summary']} "
            f"Fuente: [{claim['source_channel']} - {claim['source_title']}]({claim['source_url']}). "
            f"Polaridad: {claim['polarity']}. Confianza: {claim['confidence']}. {review}."
        )

    lines.extend(["", "## Preguntas de comprador"])
    for question in record["buyer_questions"]:
        lines.append(f"- {question}")

    lines.extend(["", "## Estructura sugerida"])
    for index, item in enumerate(record["article_outline"], start=1):
        lines.append(f"{index}. {item}")

    lines.extend(["", "## Reglas editoriales"])
    for item in record["editorial_guardrails"]:
        lines.append(f"- {item}")

    return "\n".join(lines) + "\n"


def html_for(record: dict[str, Any]) -> str:
    body_parts = [
        "<!doctype html>",
        "<html lang=\"es\">",
        "<head>",
        "  <meta charset=\"utf-8\">",
        f"  <title>{html.escape('Guia editorial Tixuz: ' + record['topic'])}</title>",
        "  <meta name=\"robots\" content=\"noindex,nofollow\">",
        "  <style>body{font-family:Arial,sans-serif;max-width:980px;margin:40px auto;padding:0 20px;line-height:1.55;color:#1f2933}iframe{width:100%;aspect-ratio:16/9;border:0}.claim{border-left:4px solid #cbd5e1;padding-left:12px;margin:16px 0}.meta{color:#52606d}</style>",
        "</head>",
        "<body>",
        f"  <h1>Guia editorial Tixuz: {html.escape(record['topic'])}</h1>",
        f"  <p class=\"meta\">{html.escape(record['status'])} · Puntaje {record['publication_score']}/100</p>",
        f"  <p>{html.escape(record['angle'])}</p>",
        "  <h2>Videos principales</h2>",
    ]

    for video in record["videos_to_embed"]:
        body_parts.append(f"  <h3>{html.escape(video['title'])}</h3>")
        body_parts.append(f"  <p class=\"meta\">{html.escape(video['channel'])} · {html.escape(video['usage'])}</p>")
        body_parts.append(f"  <iframe src=\"https://www.youtube.com/embed/{html.escape(video['video_id'])}\" allowfullscreen loading=\"lazy\"></iframe>")

    body_parts.extend(["  <h2>Claims seleccionados</h2>"])
    for claim in record["selected_claims"]:
        body_parts.append("  <div class=\"claim\">")
        body_parts.append(f"    <p>{html.escape(claim['summary'])}</p>")
        body_parts.append(
            f"    <p class=\"meta\">Fuente: <a href=\"{html.escape(claim['source_url'])}\">{html.escape(claim['source_channel'])} - {html.escape(claim['source_title'])}</a>. "
            f"Polaridad: {html.escape(claim['polarity'])}. Confianza: {html.escape(claim['confidence'])}.</p>"
        )
        body_parts.append("  </div>")

    body_parts.extend(["  <h2>Preguntas de comprador</h2>", "  <ul>"])
    for question in record["buyer_questions"]:
        body_parts.append(f"    <li>{html.escape(question)}</li>")
    body_parts.extend(["  </ul>", "  <h2>Estructura sugerida</h2>", "  <ol>"])
    for item in record["article_outline"]:
        body_parts.append(f"    <li>{html.escape(item)}</li>")
    body_parts.extend(["  </ol>", "</body>", "</html>"])
    return "\n".join(body_parts) + "\n"


def write_index(base_dir: Path, records: list[dict[str, Any]]) -> None:
    write_json(base_dir / "index.json", records)
    fieldnames = [
        "topic",
        "slug",
        "status",
        "publication_score",
        "claim_count",
        "selected_claim_count",
        "source_count",
        "owned_tixuz_video_count",
        "angle",
    ]
    with (base_dir / "index.csv").open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for record in records:
            writer.writerow({field: record.get(field, "") for field in fieldnames})


def main() -> None:
    parser = argparse.ArgumentParser(description="Create local editorial briefs from aggregated YouTube claims.")
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT))
    parser.add_argument("--claims-by-topic", help="Path to claims_by_topic.json.")
    parser.add_argument("--owned-records-dir", help="Path to owned Tixuz ficha records.")
    parser.add_argument("--briefs-dir", help="Output directory for briefs.")
    parser.add_argument("--limit", type=int, default=20)
    parser.add_argument("--max-claims", type=int, default=12)
    parser.add_argument("--max-owned-videos", type=int, default=4)
    parser.add_argument("--max-videos", type=int, default=5)
    args = parser.parse_args()

    output = Path(args.output)
    claims_path = Path(args.claims_by_topic) if args.claims_by_topic else output / "knowledge" / "claims_by_topic.json"
    owned_dir = Path(args.owned_records_dir) if args.owned_records_dir else output / "fichas" / "records"
    briefs_dir = Path(args.briefs_dir) if args.briefs_dir else output / "knowledge" / "briefs"

    aggregate = read_json(claims_path)
    owned_records = load_owned_records(owned_dir)
    records: list[dict[str, Any]] = []

    topic_items = list((aggregate.get("topics") or {}).items())[: args.limit]
    for topic, data in topic_items:
        topic = repair_text(topic)
        owned = best_owned_records(topic, owned_records, args.max_owned_videos)
        record = make_record(topic, data, owned, args.max_claims, args.max_videos)
        records.append(record)

        slug = record["slug"]
        write_json(briefs_dir / "records" / f"{slug}.json", record)
        (briefs_dir / "markdown").mkdir(parents=True, exist_ok=True)
        (briefs_dir / "markdown" / f"{slug}.md").write_text(markdown_for(record), encoding="utf-8")
        (briefs_dir / "html").mkdir(parents=True, exist_ok=True)
        (briefs_dir / "html" / f"{slug}.html").write_text(html_for(record), encoding="utf-8")

    write_index(briefs_dir, records)
    print(json.dumps({
        "briefs": len(records),
        "briefs_dir": str(briefs_dir),
        "records": str(briefs_dir / "records"),
        "markdown": str(briefs_dir / "markdown"),
        "html": str(briefs_dir / "html"),
        "index": str(briefs_dir / "index.json"),
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
