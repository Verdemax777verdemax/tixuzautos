#!/usr/bin/env python3
"""Fetch a flat catalog from a YouTube channel."""

from __future__ import annotations

import argparse
import csv
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from yt_dlp import YoutubeDL


DEFAULT_TABS = ("videos", "shorts", "streams")
OWNED_RIGHTS = {"owned", "authorized"}


def channel_tab_url(channel: str, tab: str) -> str:
    if channel.startswith("http://") or channel.startswith("https://"):
        return channel.rstrip("/") + "/" + tab
    if channel.startswith("@"):
        return f"https://www.youtube.com/{channel}/{tab}"
    return f"https://www.youtube.com/channel/{channel}/{tab}"


def fix_mojibake(value: Any) -> Any:
    if not isinstance(value, str):
        return value
    if "Ã" not in value and "Â" not in value:
        return value
    try:
        return value.encode("latin1").decode("utf-8")
    except UnicodeError:
        return value


def extract_tab(channel: str, tab: str) -> dict[str, Any]:
    options = {
        "extract_flat": True,
        "ignoreerrors": True,
        "quiet": True,
        "no_warnings": False,
        "extractor_args": {"youtube": {"lang": ["es"]}},
    }
    with YoutubeDL(options) as ydl:
        return ydl.extract_info(channel_tab_url(channel, tab), download=False) or {}


def normalize_entry(entry: dict[str, Any], tab: str) -> dict[str, Any]:
    video_id = entry.get("id")
    url = entry.get("url") or (f"https://www.youtube.com/watch?v={video_id}" if video_id else "")
    if url and not url.startswith("http"):
        url = f"https://www.youtube.com/watch?v={video_id or url}"
    return {
        "id": video_id,
        "url": url,
        "title": fix_mojibake(entry.get("title") or ""),
        "duration": entry.get("duration"),
        "timestamp": entry.get("timestamp"),
        "tabs": [tab],
        "thumbnail": (entry.get("thumbnails") or [{}])[-1].get("url") if entry.get("thumbnails") else "",
    }


def source_context(
    *,
    source_key: str,
    source_name: str,
    source_owner: str,
    source_url: str,
    usage_rights: str,
    relationship: str,
    permission_note: str,
    channel: str,
    channel_title: str,
    channel_id: str,
) -> dict[str, Any]:
    is_owned = usage_rights in OWNED_RIGHTS
    return {
        "source_key": source_key,
        "source_name": source_name or channel_title or source_key,
        "source_owner": source_owner,
        "source_url": source_url or channel,
        "source_channel": channel,
        "source_channel_title": channel_title,
        "source_channel_id": channel_id,
        "usage_rights": usage_rights,
        "relationship": relationship,
        "permission_note": permission_note,
        "reuse_policy": "full_reuse_allowed" if is_owned else "embed_link_and_summarize_only",
        "transcript_policy": "store_full_transcript" if is_owned else "do_not_store_full_transcript_without_permission",
    }


def fetch_catalog(channel: str, tabs: list[str]) -> dict[str, Any]:
    by_id: dict[str, dict[str, Any]] = {}
    source_counts: dict[str, int] = {}
    channel_title = ""
    channel_id = ""

    for tab in tabs:
        data = extract_tab(channel, tab)
        source_counts[tab] = len(data.get("entries") or [])
        channel_title = channel_title or fix_mojibake(data.get("channel") or data.get("title") or "")
        channel_id = channel_id or data.get("channel_id") or data.get("id") or ""
        for raw in data.get("entries") or []:
            if not raw or not raw.get("id"):
                continue
            item = normalize_entry(raw, tab)
            existing = by_id.get(item["id"])
            if existing:
                existing["tabs"] = sorted(set(existing.get("tabs", []) + [tab]))
                continue
            by_id[item["id"]] = item

    return {
        "channel": channel,
        "channel_title": channel_title,
        "channel_id": channel_id,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "source_counts": source_counts,
        "total_unique": len(by_id),
        "videos": list(by_id.values()),
    }


def apply_source(catalog: dict[str, Any], source: dict[str, Any]) -> dict[str, Any]:
    catalog["source"] = source
    for video in catalog.get("videos", []):
        video["source"] = source
    return catalog


def write_outputs(catalog: dict[str, Any], output: Path) -> None:
    catalog_dir = output / "catalog"
    catalog_dir.mkdir(parents=True, exist_ok=True)
    (catalog_dir / "videos.json").write_text(json.dumps(catalog, ensure_ascii=False, indent=2), encoding="utf-8")

    rows = catalog["videos"]
    with (catalog_dir / "videos.csv").open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "id",
                "url",
                "title",
                "duration",
                "timestamp",
                "tabs",
                "thumbnail",
                "source_name",
                "usage_rights",
                "reuse_policy",
            ],
        )
        writer.writeheader()
        for row in rows:
            source = row.get("source") if isinstance(row.get("source"), dict) else {}
            writer.writerow(
                {
                    "id": row.get("id"),
                    "url": row.get("url"),
                    "title": row.get("title"),
                    "duration": row.get("duration"),
                    "timestamp": row.get("timestamp"),
                    "tabs": ",".join(row.get("tabs", [])),
                    "thumbnail": row.get("thumbnail"),
                    "source_name": source.get("source_name"),
                    "usage_rights": source.get("usage_rights"),
                    "reuse_policy": source.get("reuse_policy"),
                }
            )


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch a YouTube catalog.")
    parser.add_argument("--channel", default="@Tixuz", help="YouTube handle, channel ID, or channel URL.")
    parser.add_argument("--output", default="youtube-library-output", help="Output directory.")
    parser.add_argument("--tabs", nargs="+", default=list(DEFAULT_TABS), help="Tabs to extract.")
    parser.add_argument("--source-key", default="tixuz", help="Stable source key for the catalog.")
    parser.add_argument("--source-name", default="", help="Human source name shown in generated fichas.")
    parser.add_argument("--source-owner", default="Eduardo Vargas", help="Owner or creator of the source channel.")
    parser.add_argument("--source-url", default="", help="Canonical URL for the source channel.")
    parser.add_argument(
        "--usage-rights",
        choices=["owned", "authorized", "external-reference"],
        default="owned",
        help="Rights mode for generated reuse.",
    )
    parser.add_argument("--relationship", default="owned-channel", help="Relationship to Tixuz Autos.")
    parser.add_argument("--permission-note", default="", help="Short note about reuse permission.")
    args = parser.parse_args()

    catalog = fetch_catalog(args.channel, args.tabs)
    source = source_context(
        source_key=args.source_key,
        source_name=args.source_name,
        source_owner=args.source_owner,
        source_url=args.source_url,
        usage_rights=args.usage_rights,
        relationship=args.relationship,
        permission_note=args.permission_note,
        channel=args.channel,
        channel_title=catalog.get("channel_title", ""),
        channel_id=catalog.get("channel_id", ""),
    )
    catalog = apply_source(catalog, source)
    write_outputs(catalog, Path(args.output))
    print(json.dumps({"total_unique": catalog["total_unique"], "source_counts": catalog["source_counts"], "source": source}, ensure_ascii=False))


if __name__ == "__main__":
    main()
