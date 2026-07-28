#!/usr/bin/env python3
"""Extract attributed vehicle claims without storing external transcripts."""

from __future__ import annotations

import argparse
import csv
import json
import os
import re
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from yt_dlp import YoutubeDL
from youtube_transcript_api import YouTubeTranscriptApi

from ai_router import AIRouterError, load_config, route_json


LANGUAGES = ("es", "es-419", "en")
POSITIVE_TERMS = (
    "bueno",
    "buena",
    "confiable",
    "recomendable",
    "conviene",
    "eficiente",
    "seguro",
    "comodo",
    "cómodo",
    "potente",
    "barato",
    "accesible",
    "vale la pena",
)
NEGATIVE_TERMS = (
    "malo",
    "mala",
    "falla",
    "fallas",
    "problema",
    "problemas",
    "caro",
    "costoso",
    "no recomiendo",
    "no conviene",
    "ruido",
    "inseguro",
    "lento",
    "peor",
    "defecto",
    "riesgo",
)
KNOWN_BRANDS = (
    "Abarth",
    "Acura",
    "Alfa Romeo",
    "Audi",
    "BAIC",
    "BMW",
    "BYD",
    "Changan",
    "Chevrolet",
    "Chirey",
    "Chrysler",
    "Cupra",
    "Dodge",
    "Fiat",
    "Ford",
    "GAC",
    "Geely",
    "GMC",
    "Great Wall",
    "Honda",
    "Hyundai",
    "Infiniti",
    "JAC",
    "Jaecoo",
    "Jeep",
    "Jetour",
    "Kia",
    "Land Rover",
    "Lexus",
    "Mazda",
    "Mercedes",
    "Mercedes-Benz",
    "MG",
    "Mini",
    "Mitsubishi",
    "Nissan",
    "Omoda",
    "Peugeot",
    "Ram",
    "Renault",
    "Seat",
    "Subaru",
    "Suzuki",
    "Tesla",
    "Toyota",
    "Volkswagen",
    "Volvo",
)
TOPIC_STOPWORDS = {
    "Con",
    "Lalo",
    "Vargas",
    "Eduardo",
    "Tixuz",
    "Autos",
    "Me",
    "Compro",
    "Milla",
    "Sergio",
    "Oliveira",
}


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
            os.environ.setdefault(key, value)


def load_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8-sig"))


def segment_text(segment: Any) -> str:
    if isinstance(segment, dict):
        return segment.get("text", "")
    return getattr(segment, "text", "")


def segment_start(segment: Any) -> float | None:
    if isinstance(segment, dict):
        return segment.get("start")
    return getattr(segment, "start", None)


def fetch_transcript(video_id: str) -> dict[str, Any]:
    try:
        return fetch_transcript_api(video_id)
    except Exception:
        return fetch_transcript_ytdlp(video_id)


def fetch_transcript_api(video_id: str) -> dict[str, Any]:
    api = YouTubeTranscriptApi()
    transcript_list = api.list(video_id)
    picked = None
    for language in LANGUAGES:
        try:
            picked = transcript_list.find_transcript([language])
            break
        except Exception:
            pass
    if picked is None:
        picked = next(iter(transcript_list))
    rows = picked.fetch()
    text = " ".join(segment_text(row).replace("\n", " ").strip() for row in rows if segment_text(row).strip())
    return {
        "language": picked.language,
        "language_code": picked.language_code,
        "is_generated": picked.is_generated,
        "fetch_method": "youtube_transcript_api",
        "segments": [
            {"text": segment_text(row), "start": segment_start(row)}
            for row in rows
            if segment_text(row).strip()
        ],
        "text": text,
    }


def pick_caption(captions: dict[str, Any]) -> tuple[str, dict[str, Any]] | None:
    for language in ("es", "es-orig", "es-419", "es-US", "en"):
        entries = captions.get(language) or []
        json_entry = next((entry for entry in entries if entry.get("ext") == "json3"), None)
        if json_entry:
            return language, json_entry
    for language, entries in captions.items():
        json_entry = next((entry for entry in entries if entry.get("ext") == "json3"), None)
        if json_entry:
            return language, json_entry
    return None


def parse_json3_caption(data: dict[str, Any]) -> list[dict[str, Any]]:
    rows = []
    for event in data.get("events") or []:
        parts = [seg.get("utf8", "") for seg in event.get("segs") or [] if seg.get("utf8")]
        text = clean_text("".join(parts))
        if not text:
            continue
        start = event.get("tStartMs")
        rows.append({"text": text, "start": start / 1000 if isinstance(start, int | float) else None})
    return rows


def fetch_transcript_ytdlp(video_id: str) -> dict[str, Any]:
    url = f"https://www.youtube.com/watch?v={video_id}"
    options = {
        "skip_download": True,
        "ignoreerrors": True,
        "quiet": True,
        "no_warnings": True,
        "extractor_args": {"youtube": {"lang": ["es"]}},
    }
    with YoutubeDL(options) as ydl:
        info = ydl.extract_info(url, download=False) or {}
    picked = pick_caption(info.get("subtitles") or {}) or pick_caption(info.get("automatic_captions") or {})
    if not picked:
        raise RuntimeError("NoCaptionTrack")
    language, caption = picked
    request = urllib.request.Request(caption["url"], headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(request, timeout=60) as response:  # noqa: S310
        data = json.loads(response.read().decode("utf-8"))
    segments = parse_json3_caption(data)
    return {
        "language": language,
        "language_code": language,
        "is_generated": language in (info.get("automatic_captions") or {}),
        "fetch_method": "yt_dlp_json3",
        "segments": segments,
        "text": " ".join(row["text"] for row in segments),
    }


def clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def sentence_split(text: str) -> list[str]:
    clean = clean_text(text)
    return [part.strip() for part in re.split(r"(?<=[.!?])\s+", clean) if len(part.strip()) > 35]


def polarity_for(sentence: str) -> str:
    lower = sentence.lower()
    if any(term in lower for term in NEGATIVE_TERMS):
        return "negative"
    if any(term in lower for term in POSITIVE_TERMS):
        return "positive"
    return "neutral"


def detect_topics(title: str, text: str) -> list[str]:
    haystack = f"{title} {text}"
    found = []
    for brand in KNOWN_BRANDS:
        if re.search(rf"(?<!\w){re.escape(brand)}(?!\w)", haystack, flags=re.IGNORECASE):
            found.append(brand)
    if found:
        return found[:12]
    terms = sorted(set(re.findall(r"\b[A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ0-9-]{2,}\b", haystack)))
    return [term for term in terms if term not in TOPIC_STOPWORDS][:12]


def local_claims(video: dict[str, Any], details: dict[str, Any], transcript: dict[str, Any]) -> list[dict[str, Any]]:
    title = details.get("title") or video.get("title") or ""
    text = transcript.get("text") or details.get("description") or title
    topics = detect_topics(title, text)
    candidates = []
    for sentence in sentence_split(text):
        polarity = polarity_for(sentence)
        if polarity == "neutral":
            continue
        candidates.append(
            {
                "vehicle_or_brand": topics[0] if topics else "",
                "claim_summary": (
                    "El video contiene una posible opinion "
                    f"{'favorable' if polarity == 'positive' else 'critica'} sobre {topics[0] if topics else 'un tema automotriz'}; "
                    "requiere revision editorial o AI antes de publicarse como afirmacion."
                ),
                "polarity": polarity,
                "claim_type": "candidate_opinion",
                "buyer_impact": "Pendiente de clasificar.",
                "timestamp_start": None,
                "confidence": "low",
                "needs_verification": True,
                "extraction_method": "local_candidate_no_verbatim",
            }
        )
        if len(candidates) >= 6:
            break
    if candidates:
        return candidates
    fallback_topics = topics[:4] or [""]
    return [
        {
            "vehicle_or_brand": topic,
            "claim_summary": (
                f"Fuente externa registrada sobre {topic}; requiere subtitulo/AI o revision editorial "
                "para separar pros, contras y recomendaciones sin copiar el guion."
                if topic
                else "El video debe revisarse para extraer opiniones automotrices atribuidas sin copiar el guion."
            ),
            "polarity": "neutral",
            "claim_type": "review_needed",
            "buyer_impact": "Pendiente de clasificar.",
            "timestamp_start": None,
            "confidence": "low",
            "needs_verification": True,
            "extraction_method": "local_review_marker",
        }
        for topic in fallback_topics
    ]


def ai_claims(
    config: dict[str, Any],
    video: dict[str, Any],
    details: dict[str, Any],
    transcript: dict[str, Any],
    max_chars: int,
) -> tuple[list[dict[str, Any]], str]:
    source = video.get("source") if isinstance(video.get("source"), dict) else {}
    segments = transcript.get("segments") or []
    compact_segments = [
        {"start": item.get("start"), "text": item.get("text")}
        for item in segments[:900]
        if isinstance(item, dict)
    ]
    messages = [
        {
            "role": "system",
            "content": (
                "Eres extractor de conocimiento automotriz para Tixuz Autos. "
                "Extrae afirmaciones y opiniones utiles para compradores, pero NO copies la transcripcion. "
                "Parafrasea todo con palabras nuevas, atribuye al canal/persona, conserva URL y timestamp aproximado. "
                "No incluyas citas textuales largas; si necesitas evidencia, describela sin repetir el guion. "
                "No inventes marcas, modelos, precios, fallas o cifras. Devuelve solo JSON valido."
            ),
        },
        {
            "role": "user",
            "content": json.dumps(
                {
                    "schema": {
                        "claims": [
                            {
                                "vehicle_or_brand": "string",
                                "model": "string",
                                "claim_summary": "string paraphrased, no verbatim",
                                "polarity": "positive|negative|mixed|neutral",
                                "claim_type": "reliability|price|performance|comfort|safety|maintenance|market|design|technology|general",
                                "buyer_impact": "string",
                                "timestamp_start": "number|null",
                                "confidence": "high|medium|low",
                                "needs_verification": "boolean",
                            }
                        ]
                    },
                    "source": source,
                    "video": {
                        "id": video.get("id"),
                        "url": video.get("url"),
                        "title": details.get("title") or video.get("title"),
                        "description": (details.get("description") or "")[:2500],
                        "channel": details.get("channel"),
                        "upload_date": details.get("upload_date"),
                    },
                    "transcript_text": (transcript.get("text") or "")[:max_chars],
                    "timed_segments": compact_segments,
                },
                ensure_ascii=False,
            ),
        },
    ]
    data, provider = route_json(config, "extract", messages, temperature=0.05)
    claims = data.get("claims") if isinstance(data, dict) else []
    if not isinstance(claims, list):
        claims = []
    return claims, provider


def attribution(video: dict[str, Any], details: dict[str, Any]) -> dict[str, Any]:
    source = video.get("source") if isinstance(video.get("source"), dict) else {}
    return {
        "source_video_id": video.get("id"),
        "source_url": video.get("url"),
        "source_title": details.get("title") or video.get("title"),
        "source_channel": source.get("source_name") or details.get("channel"),
        "source_channel_id": source.get("source_channel_id") or details.get("channel_id"),
        "source_owner": source.get("source_owner") or "",
        "usage_rights": source.get("usage_rights") or "owned",
        "reuse_policy": source.get("reuse_policy") or "full_reuse_allowed",
    }


def write_index(claims_dir: Path, records: list[dict[str, Any]]) -> None:
    claims_dir.joinpath("index.json").write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8")
    with claims_dir.joinpath("index.csv").open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "source_video_id",
                "source_channel",
                "source_title",
                "source_url",
                "claim_count",
                "raw_transcript_stored",
                "extraction_provider",
            ],
        )
        writer.writeheader()
        for record in records:
            source = record.get("source_attribution") or {}
            writer.writerow(
                {
                    "source_video_id": source.get("source_video_id"),
                    "source_channel": source.get("source_channel"),
                    "source_title": source.get("source_title"),
                    "source_url": source.get("source_url"),
                    "claim_count": len(record.get("claims") or []),
                    "raw_transcript_stored": record.get("raw_transcript_stored"),
                    "extraction_provider": record.get("extraction_provider"),
                }
            )


def main() -> None:
    parser = argparse.ArgumentParser(description="Extract attributed vehicle claims without republishing transcripts.")
    parser.add_argument("--catalog", default="youtube-library-output/catalog/videos.json")
    parser.add_argument("--output", default="youtube-library-output")
    parser.add_argument("--provider-config", default="")
    parser.add_argument("--env-file", default="")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--start", type=int, default=0)
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--fetch-public-transcript", action="store_true", help="Use public captions ephemerally; raw text is not stored.")
    parser.add_argument("--store-raw-transcript", action="store_true", help="Only use for owned/authorized sources.")
    parser.add_argument("--ai", action="store_true")
    parser.add_argument("--allow-local-fallback", action="store_true")
    parser.add_argument("--max-chars", type=int, default=18000)
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

    claims_dir = output / "claims"
    claims_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = claims_dir / "manifest.jsonl"
    index_records = []
    written = 0
    skipped = 0
    failed = 0

    with manifest_path.open("a", encoding="utf-8") as manifest:
        for video in videos:
            video_id = video.get("id")
            if not video_id:
                continue
            out_path = claims_dir / f"{video_id}.json"
            if out_path.exists() and not args.force:
                index_records.append(load_json(out_path, {}))
                skipped += 1
                continue

            details = load_json(output / "details" / f"{video_id}.json", {})
            transcript = load_json(output / "transcripts" / f"{video_id}.json", {})
            transcript_fetch_error = ""
            if not transcript.get("text") and args.fetch_public_transcript:
                try:
                    transcript = fetch_transcript(video_id)
                except Exception as exc:  # noqa: BLE001
                    transcript_fetch_error = type(exc).__name__
                    transcript = {}

            provider = "local"
            try:
                if args.ai and (transcript.get("text") or details.get("description")):
                    claims, provider = ai_claims(config, video, details, transcript, args.max_chars)
                else:
                    claims = local_claims(video, details, transcript)
            except AIRouterError as exc:
                if not args.allow_local_fallback:
                    manifest.write(json.dumps({"id": video_id, "ok": False, "error": str(exc)}, ensure_ascii=False) + "\n")
                    failed += 1
                    continue
                claims = local_claims(video, details, transcript)
                provider = "local_fallback"

            source = attribution(video, details)
            can_store_raw = args.store_raw_transcript and source.get("usage_rights") in {"owned", "authorized"}
            record = {
                "source_attribution": source,
                "claims": claims,
                "raw_transcript_stored": bool(can_store_raw and transcript.get("text")),
                "raw_transcript": transcript.get("text") if can_store_raw else "",
                "transcript_language": transcript.get("language_code"),
                "transcript_fetch_error": transcript_fetch_error,
                "content_reuse_policy": "paraphrased_claims_only" if source.get("usage_rights") == "external-reference" else "owned_or_authorized",
                "extraction_provider": provider,
                "generated_at": datetime.now(timezone.utc).isoformat(),
            }
            out_path.write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")
            index_records.append(record)
            manifest.write(
                json.dumps({"id": video_id, "ok": True, "claims": len(claims), "provider": provider}, ensure_ascii=False) + "\n"
            )
            written += 1

    write_index(claims_dir, index_records)
    print(json.dumps({"claims_files_written": written, "skipped": skipped, "failed": failed, "index": str(claims_dir / "index.json")}, ensure_ascii=False))


if __name__ == "__main__":
    sys.path.insert(0, str(Path(__file__).parent))
    main()
