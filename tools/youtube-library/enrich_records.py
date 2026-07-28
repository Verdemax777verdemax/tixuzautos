#!/usr/bin/env python3
"""Create enriched publishing drafts from YouTube metadata and transcripts."""

from __future__ import annotations

import argparse
import json
import os
import re
import unicodedata
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def slugify(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", normalized.lower()).strip("-")
    return re.sub(r"-{2,}", "-", slug)[:90] or "video"


def load_catalog(catalog_path: Path) -> list[dict[str, Any]]:
    data = json.loads(catalog_path.read_text(encoding="utf-8-sig"))
    return data.get("videos", [])


def read_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def sentence_split(text: str, limit: int = 6) -> list[str]:
    clean = re.sub(r"\s+", " ", text).strip()
    parts = re.split(r"(?<=[.!?])\s+", clean)
    return [part.strip() for part in parts if len(part.strip()) > 35][:limit]


def local_enrichment(video: dict[str, Any], details: dict[str, Any], transcript: dict[str, Any]) -> dict[str, Any]:
    title = details.get("title") or video.get("title") or ""
    text = transcript.get("text") or details.get("description") or ""
    key_points = sentence_split(text, limit=8)
    description = " ".join(key_points[:3]) if key_points else (details.get("description") or "")[:500]
    topics = sorted(set(re.findall(r"\b[A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ0-9-]{2,}\b", title + " " + text)))[:20]

    return {
        "source_video_id": video.get("id"),
        "source_url": video.get("url"),
        "source": video.get("source") or {},
        "draft_status": "needs_ai_review",
        "slug": f"{slugify(title)}-{video.get('id')}",
        "title_original": title,
        "title_seo": title[:90],
        "summary": description,
        "key_points": key_points,
        "detected_topics": topics,
        "buyer_intent": [],
        "vehicle_entities": [],
        "content_type": "youtube_video",
        "transcript_language": transcript.get("language_code"),
        "transcript_is_generated": transcript.get("is_generated"),
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


def ai_enrichment(
    video: dict[str, Any],
    details: dict[str, Any],
    transcript: dict[str, Any],
    api_key: str,
    api_base: str,
    model: str,
    max_chars: int,
) -> dict[str, Any]:
    title = details.get("title") or video.get("title") or ""
    source = video.get("source") if isinstance(video.get("source"), dict) else {}
    external_note = (
        "Si usage_rights es external-reference, trata el video como fuente externa: resume, atribuye y no copies bloques largos."
        if source.get("usage_rights") == "external-reference"
        else "El video pertenece a Tixuz o esta autorizado para reutilizacion editorial."
    )
    transcript_text = (transcript.get("text") or "")[:max_chars]
    payload = {
        "model": model,
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
        "messages": [
            {
                "role": "system",
                "content": (
                    "Eres editor SEO de Tixuz Autos. Convierte videos propios, autorizados o colaboraciones "
                    "en borradores publicables, utiles para compradores y entendibles por agentes AI. "
                    "No inventes marcas, modelos, anos, precios, fallas ni cifras. Para entidades de autos, "
                    "solo usa datos mencionados explicitamente en titulo, descripcion o transcripcion. "
                    "Si falta un dato, usa cadena vacia y agrega una nota de verificacion. "
                    f"{external_note} Devuelve solo JSON valido."
                ),
            },
            {
                "role": "user",
                "content": json.dumps(
                    {
                        "schema": {
                            "source_video_id": "string",
                            "slug": "string",
                            "title_seo": "string",
                            "summary": "string",
                            "key_points": ["string"],
                            "vehicle_entities": [{"make": "string", "model": "string", "year": "string", "evidence": "string"}],
                            "market_topics": ["string"],
                            "buyer_intent": ["string"],
                            "safety_or_context_notes": ["string"],
                            "publishable_article_outline": ["string"],
                            "verification_notes": ["string"],
                        },
                        "video": {
                            "id": video.get("id"),
                            "url": video.get("url"),
                            "source": source,
                            "title": title,
                            "description": details.get("description", "")[:3000],
                            "duration": details.get("duration") or video.get("duration"),
                        },
                        "transcript": transcript_text,
                    },
                    ensure_ascii=False,
                ),
            },
        ],
    }

    request = urllib.request.Request(
        api_base.rstrip("/") + "/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=120) as response:  # noqa: S310
        data = json.loads(response.read().decode("utf-8"))
    content = data["choices"][0]["message"]["content"]
    enriched = json.loads(content)
    enriched["source_video_id"] = enriched.get("source_video_id") or video.get("id")
    enriched["source_url"] = video.get("url")
    enriched["source"] = source
    enriched["generated_at"] = datetime.now(timezone.utc).isoformat()
    enriched["model"] = model
    return enriched


def main() -> None:
    parser = argparse.ArgumentParser(description="Create enriched Tixuz publishing drafts.")
    parser.add_argument("--catalog", default="youtube-library-output/catalog/videos.json")
    parser.add_argument("--output", default="youtube-library-output")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--provider", choices=["local", "openai-compatible"], default="local")
    parser.add_argument("--api-key-env", default="OPENAI_API_KEY")
    parser.add_argument("--api-base", default="https://api.openai.com/v1")
    parser.add_argument("--model", default="gpt-4o-mini")
    parser.add_argument("--max-chars", type=int, default=18000)
    args = parser.parse_args()

    videos = load_catalog(Path(args.catalog))
    if args.limit:
        videos = videos[: args.limit]

    output = Path(args.output)
    details_dir = output / "details"
    transcripts_dir = output / "transcripts"
    enriched_dir = output / "enriched"
    enriched_dir.mkdir(parents=True, exist_ok=True)

    api_key = ""
    if args.provider == "openai-compatible":
        api_key = os.environ.get(args.api_key_env, "")
        if not api_key:
            raise SystemExit(f"Missing API key environment variable: {args.api_key_env}")

    written = 0
    skipped = 0
    for video in videos:
        video_id = video.get("id")
        if not video_id:
            continue
        out_path = enriched_dir / f"{video_id}.json"
        if out_path.exists() and not args.force:
            skipped += 1
            continue
        details = read_json(details_dir / f"{video_id}.json")
        transcript = read_json(transcripts_dir / f"{video_id}.json")
        if args.provider == "openai-compatible":
            record = ai_enrichment(video, details, transcript, api_key, args.api_base, args.model, args.max_chars)
        else:
            record = local_enrichment(video, details, transcript)
        out_path.write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")
        written += 1

    print(json.dumps({"enriched_written": written, "skipped": skipped}, ensure_ascii=False))


if __name__ == "__main__":
    main()
