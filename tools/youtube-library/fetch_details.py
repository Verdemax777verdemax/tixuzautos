#!/usr/bin/env python3
"""Fetch full metadata for catalog videos without downloading media."""

from __future__ import annotations

import argparse
import json
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from yt_dlp import YoutubeDL


def fix_mojibake(value: Any) -> Any:
    if isinstance(value, str):
        if "Ã" not in value and "Â" not in value:
            return value
        try:
            return value.encode("latin1").decode("utf-8")
        except UnicodeError:
            return value
    if isinstance(value, list):
        return [fix_mojibake(item) for item in value]
    if isinstance(value, dict):
        return {key: fix_mojibake(item) for key, item in value.items()}
    return value


def load_videos(catalog_path: Path) -> list[dict[str, Any]]:
    data = json.loads(catalog_path.read_text(encoding="utf-8-sig"))
    return data.get("videos", [])


def safe_details(info: dict[str, Any]) -> dict[str, Any]:
    keys = [
        "id",
        "webpage_url",
        "title",
        "description",
        "duration",
        "upload_date",
        "timestamp",
        "view_count",
        "like_count",
        "comment_count",
        "channel",
        "channel_id",
        "channel_url",
        "categories",
        "tags",
        "thumbnail",
        "thumbnails",
        "availability",
        "live_status",
    ]
    return {key: fix_mojibake(info.get(key)) for key in keys if key in info}


def fetch_detail(url: str) -> dict[str, Any]:
    options = {
        "skip_download": True,
        "ignoreerrors": True,
        "quiet": True,
        "no_warnings": False,
        "extractor_args": {"youtube": {"lang": ["es"]}},
    }
    with YoutubeDL(options) as ydl:
        info = ydl.extract_info(url, download=False) or {}
    return safe_details(info)


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch full YouTube metadata for catalog videos.")
    parser.add_argument("--catalog", default="youtube-library-output/catalog/videos.json")
    parser.add_argument("--output", default="youtube-library-output")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--sleep", type=float, default=0.3)
    args = parser.parse_args()

    videos = load_videos(Path(args.catalog))
    if args.limit:
        videos = videos[: args.limit]

    details_dir = Path(args.output) / "details"
    details_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = details_dir / "manifest.jsonl"

    done = 0
    failed = 0
    with manifest_path.open("a", encoding="utf-8") as manifest:
        for video in videos:
            video_id = video.get("id")
            if not video_id:
                continue
            out_path = details_dir / f"{video_id}.json"
            if out_path.exists() and not args.force:
                continue
            try:
                details = fetch_detail(video.get("url") or f"https://www.youtube.com/watch?v={video_id}")
                details["fetched_at"] = datetime.now(timezone.utc).isoformat()
                out_path.write_text(json.dumps(details, ensure_ascii=False, indent=2), encoding="utf-8")
                manifest.write(json.dumps({"id": video_id, "ok": True, "path": str(out_path)}, ensure_ascii=False) + "\n")
                done += 1
            except Exception as exc:  # noqa: BLE001
                manifest.write(json.dumps({"id": video_id, "ok": False, "error": type(exc).__name__}, ensure_ascii=False) + "\n")
                failed += 1
            manifest.flush()
            time.sleep(args.sleep)

    print(json.dumps({"details_written": done, "failed": failed}, ensure_ascii=False))


if __name__ == "__main__":
    main()
