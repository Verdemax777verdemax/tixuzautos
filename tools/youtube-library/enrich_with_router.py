#!/usr/bin/env python3
"""Enrich YouTube records through a cheap-to-strong AI route."""

from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from ai_router import AIRouterError, load_config, route_json


def load_env_file(path: str) -> None:
    if not path:
        return
    env_path = Path(path)
    if not env_path.exists():
        return
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and value:
            import os

            os.environ.setdefault(key, value)


def slugify(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", normalized.lower()).strip("-")
    return re.sub(r"-{2,}", "-", slug)[:90] or "video"


def load_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8-sig"))


def local_record(video: dict[str, Any], details: dict[str, Any], transcript: dict[str, Any]) -> dict[str, Any]:
    title = details.get("title") or video.get("title") or ""
    text = transcript.get("text") or details.get("description") or ""
    clean = re.sub(r"\s+", " ", text).strip()
    sentences = [part.strip() for part in re.split(r"(?<=[.!?])\s+", clean) if len(part.strip()) > 35]
    return {
        "source_video_id": video.get("id"),
        "source_url": video.get("url"),
        "source": video.get("source") or {},
        "slug": f"{slugify(title)}-{video.get('id')}",
        "title_original": title,
        "title_seo": title[:90],
        "meta_description": (sentences[0] if sentences else details.get("description", ""))[:155],
        "executive_summary": " ".join(sentences[:3])[:1200],
        "key_takeaways": sentences[:8],
        "vehicles_or_brands": [],
        "buyer_questions_answered": [],
        "market_topics": [],
        "publishable_article_outline": [],
        "internal_links_to_create": [],
        "schema_org_notes": ["VideoObject", "BreadcrumbList"],
        "editorial_warnings": ["Borrador local: requiere revision AI/editorial antes de publicar."],
        "enrichment_provider": "local",
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


def extract_facts(config: dict[str, Any], video: dict[str, Any], details: dict[str, Any], transcript_text: str, max_chars: int) -> tuple[dict[str, Any], str]:
    source = video.get("source") if isinstance(video.get("source"), dict) else {}
    messages = [
        {
            "role": "system",
            "content": (
                "Eres extractor de datos automotrices para Tixuz Autos. "
                "Regla critica: no inventes. Extrae solo hechos mencionados explicitamente. "
                "Cada marca/modelo debe traer evidence textual corta. Devuelve JSON valido."
            ),
        },
        {
            "role": "user",
            "content": json.dumps(
                {
                    "schema": {
                        "vehicle_entities": [
                            {"make": "string", "model": "string", "year": "string", "evidence": "string", "confidence": "high|medium|low"}
                        ],
                        "market_topics": ["string"],
                        "buyer_questions_answered": ["string"],
                        "claims_to_verify": ["string"],
                    },
                    "video": {
                        "id": video.get("id"),
                        "source": source,
                        "title": details.get("title") or video.get("title"),
                        "description": (details.get("description") or "")[:3000],
                    },
                    "transcript": transcript_text[:max_chars],
                },
                ensure_ascii=False,
            ),
        },
    ]
    return route_json(config, "extract", messages, temperature=0.05)


def editorial_record(
    config: dict[str, Any],
    video: dict[str, Any],
    details: dict[str, Any],
    transcript_text: str,
    facts: dict[str, Any],
    max_chars: int,
) -> tuple[dict[str, Any], str]:
    source = video.get("source") if isinstance(video.get("source"), dict) else {}
    external_note = (
        "Si usage_rights es external-reference, crea una ficha de colaboracion con atribucion, embed/enlace y resumen original. No copies bloques largos ni presentes el contenido como propio."
        if source.get("usage_rights") == "external-reference"
        else "El contenido es propio o autorizado para reutilizacion editorial de Tixuz."
    )
    messages = [
        {
            "role": "system",
            "content": (
                "Eres editor senior SEO de Tixuz Autos en Mexico. "
                "Convierte videos propios, autorizados o colaboraciones en fichas publicables para compradores, Google y agentes AI. "
                "Usa estilo claro, util y editorial. No inventes datos tecnicos ni cifras. "
                "Si algo requiere confirmacion, ponlo en editorial_warnings. "
                f"{external_note} Devuelve JSON valido."
            ),
        },
        {
            "role": "user",
            "content": json.dumps(
                {
                    "schema": {
                        "source_video_id": "string",
                        "source_url": "string",
                        "slug": "string",
                        "title_seo": "string",
                        "meta_description": "string",
                        "executive_summary": "string",
                        "key_takeaways": ["string"],
                        "vehicles_or_brands": [
                            {"make": "string", "model": "string", "year": "string", "confidence": "high|medium|low", "evidence": "string"}
                        ],
                        "buyer_questions_answered": ["string"],
                        "market_topics": ["string"],
                        "publishable_article_outline": ["string"],
                        "internal_links_to_create": ["string"],
                        "schema_org_notes": ["string"],
                        "editorial_warnings": ["string"],
                    },
                    "video": {
                        "id": video.get("id"),
                        "url": video.get("url"),
                        "source": source,
                        "title": details.get("title") or video.get("title"),
                        "description": (details.get("description") or "")[:3000],
                        "duration": details.get("duration") or video.get("duration"),
                        "upload_date": details.get("upload_date"),
                    },
                    "extracted_facts": facts,
                    "transcript": transcript_text[:max_chars],
                },
                ensure_ascii=False,
            ),
        },
    ]
    return route_json(config, "editorial", messages, temperature=0.12)


def main() -> None:
    parser = argparse.ArgumentParser(description="Create enriched fichas using the AI router.")
    parser.add_argument("--catalog", default="youtube-library-output/catalog/videos.json")
    parser.add_argument("--output", default="youtube-library-output")
    parser.add_argument("--provider-config", default="")
    parser.add_argument("--env-file", default="", help="Private local env file. Never commit it.")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--start", type=int, default=0)
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--max-chars", type=int, default=18000)
    parser.add_argument("--allow-local-fallback", action="store_true")
    args = parser.parse_args()

    load_env_file(args.env_file)
    config = load_config(args.provider_config)
    output = Path(args.output)
    catalog = load_json(Path(args.catalog), {})
    videos = catalog.get("videos", [])
    if args.start:
        videos = videos[args.start :]
    if args.limit:
        videos = videos[: args.limit]

    enriched_dir = output / "enriched-ai"
    facts_dir = output / "facts-ai"
    enriched_dir.mkdir(parents=True, exist_ok=True)
    facts_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = enriched_dir / "manifest.jsonl"

    written = 0
    skipped = 0
    failed = 0
    with manifest_path.open("a", encoding="utf-8") as manifest:
        for video in videos:
            video_id = video.get("id")
            if not video_id:
                continue
            out_path = enriched_dir / f"{video_id}.json"
            if out_path.exists() and not args.force:
                skipped += 1
                continue
            details = load_json(output / "details" / f"{video_id}.json", {})
            transcript = load_json(output / "transcripts" / f"{video_id}.json", {})
            transcript_text = transcript.get("text", "")
            if not transcript_text:
                manifest.write(json.dumps({"id": video_id, "ok": False, "error": "missing_transcript"}, ensure_ascii=False) + "\n")
                failed += 1
                continue
            try:
                facts, facts_provider = extract_facts(config, video, details, transcript_text, args.max_chars)
                record, editorial_provider = editorial_record(config, video, details, transcript_text, facts, args.max_chars)
                record["source_video_id"] = record.get("source_video_id") or video_id
                record["source_url"] = record.get("source_url") or video.get("url")
                record["source"] = video.get("source") or {}
                record["slug"] = record.get("slug") or f"{slugify(record.get('title_seo') or details.get('title') or video.get('title') or video_id)}-{video_id}"
                record["generated_at"] = datetime.now(timezone.utc).isoformat()
                record["enrichment_provider"] = editorial_provider
                record["facts_provider"] = facts_provider
                facts_dir.joinpath(f"{video_id}.json").write_text(json.dumps(facts, ensure_ascii=False, indent=2), encoding="utf-8")
            except AIRouterError as exc:
                if not args.allow_local_fallback:
                    manifest.write(json.dumps({"id": video_id, "ok": False, "error": str(exc)}, ensure_ascii=False) + "\n")
                    failed += 1
                    continue
                record = local_record(video, details, transcript)
            out_path.write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")
            manifest.write(json.dumps({"id": video_id, "ok": True, "provider": record.get("enrichment_provider")}, ensure_ascii=False) + "\n")
            written += 1

    print(json.dumps({"enriched_ai_written": written, "skipped": skipped, "failed": failed}, ensure_ascii=False))


if __name__ == "__main__":
    sys.path.insert(0, str(Path(__file__).parent))
    main()
