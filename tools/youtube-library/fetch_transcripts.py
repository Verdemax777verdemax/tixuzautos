#!/usr/bin/env python3
"""Fetch YouTube transcripts for catalog videos."""

from __future__ import annotations

import argparse
import json
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from youtube_transcript_api import YouTubeTranscriptApi


LANGUAGES = ("es", "es-419", "en")
OWNED_RIGHTS = {"owned", "authorized"}


def load_videos(catalog_path: Path) -> list[dict[str, Any]]:
    data = json.loads(catalog_path.read_text(encoding="utf-8-sig"))
    return data.get("videos", [])


def segment_text(segment: Any) -> str:
    if isinstance(segment, dict):
        return segment.get("text", "")
    return getattr(segment, "text", "")


def segment_dict(segment: Any) -> dict[str, Any]:
    if isinstance(segment, dict):
        return segment
    return {
        "text": getattr(segment, "text", ""),
        "start": getattr(segment, "start", None),
        "duration": getattr(segment, "duration", None),
    }


def fetch_transcript(api: YouTubeTranscriptApi, video_id: str) -> dict[str, Any]:
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
    segments = [segment_dict(row) for row in rows]
    return {
        "video_id": video_id,
        "language": picked.language,
        "language_code": picked.language_code,
        "is_generated": picked.is_generated,
        "is_translatable": picked.is_translatable,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "segments": segments,
        "text": " ".join(segment_text(row).replace("\n", " ").strip() for row in rows if segment_text(row).strip()),
    }


def can_store_transcript(video: dict[str, Any], allow_external: bool) -> bool:
    if allow_external:
        return True
    source = video.get("source") if isinstance(video.get("source"), dict) else {}
    usage_rights = source.get("usage_rights") or "owned"
    return usage_rights in OWNED_RIGHTS


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch YouTube transcripts for catalog videos.")
    parser.add_argument("--catalog", default="youtube-library-output/catalog/videos.json")
    parser.add_argument("--output", default="youtube-library-output")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--start", type=int, default=0, help="Zero-based catalog index to start from.")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--sleep", type=float, default=0.5)
    parser.add_argument("--max-ip-blocks", type=int, default=3, help="Stop after this many consecutive IP blocks.")
    parser.add_argument(
        "--allow-external",
        action="store_true",
        help="Allow storing full transcripts for external-reference catalogs.",
    )
    args = parser.parse_args()

    videos = load_videos(Path(args.catalog))
    if args.start:
        videos = videos[args.start :]
    if args.limit:
        videos = videos[: args.limit]

    transcript_dir = Path(args.output) / "transcripts"
    text_dir = transcript_dir / "txt"
    transcript_dir.mkdir(parents=True, exist_ok=True)
    text_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = transcript_dir / "manifest.jsonl"
    api = YouTubeTranscriptApi()

    done = 0
    skipped = 0
    failed = 0
    consecutive_ip_blocks = 0
    with manifest_path.open("a", encoding="utf-8") as manifest:
        for video in videos:
            video_id = video.get("id")
            if not video_id:
                continue
            if not can_store_transcript(video, args.allow_external):
                manifest.write(
                    json.dumps(
                        {
                            "id": video_id,
                            "ok": False,
                            "skipped": True,
                            "reason": "external_reference_requires_permission",
                        },
                        ensure_ascii=False,
                    )
                    + "\n"
                )
                skipped += 1
                continue
            json_path = transcript_dir / f"{video_id}.json"
            txt_path = text_dir / f"{video_id}.txt"
            if json_path.exists() and not args.force:
                skipped += 1
                continue
            try:
                transcript = fetch_transcript(api, video_id)
                json_path.write_text(json.dumps(transcript, ensure_ascii=False, indent=2), encoding="utf-8")
                txt_path.write_text(transcript["text"], encoding="utf-8")
                manifest.write(json.dumps({"id": video_id, "ok": True, "language_code": transcript["language_code"]}, ensure_ascii=False) + "\n")
                done += 1
            except Exception as exc:  # noqa: BLE001
                error_name = type(exc).__name__
                manifest.write(json.dumps({"id": video_id, "ok": False, "error": error_name}, ensure_ascii=False) + "\n")
                failed += 1
                if error_name == "IpBlocked":
                    consecutive_ip_blocks += 1
                    if consecutive_ip_blocks >= args.max_ip_blocks:
                        manifest.write(json.dumps({"ok": False, "stopped": True, "reason": "IpBlocked"}, ensure_ascii=False) + "\n")
                        break
                else:
                    consecutive_ip_blocks = 0
            manifest.flush()
            time.sleep(args.sleep)

    print(json.dumps({"transcripts_written": done, "skipped": skipped, "failed": failed, "stopped_for_ip_block": consecutive_ip_blocks >= args.max_ip_blocks}, ensure_ascii=False))


if __name__ == "__main__":
    main()
