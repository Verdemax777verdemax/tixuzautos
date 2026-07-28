#!/usr/bin/env python3
"""Build a prioritized mixed-source catalog by vehicle brands or topics."""

from __future__ import annotations

import argparse
import csv
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_TOPICS = (
    "Toyota",
    "Honda",
    "Nissan",
    "Mazda",
    "Chevrolet",
    "Ford",
    "Volkswagen",
    "Kia",
    "Hyundai",
    "BYD",
    "MG",
    "JAC",
    "Chirey",
    "Omoda",
    "Jaecoo",
    "Tesla",
    "Jeep",
    "Suzuki",
    "Subaru",
    "Peugeot",
    "Renault",
    "Mitsubishi",
    "GMC",
    "Ram",
    "Fiat",
    "Infiniti",
    "Mercedes",
    "BMW",
    "Audi",
    "Volvo",
    "Cupra",
    "Seat",
    "Dodge",
)


def load_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8-sig"))


def split_topics(value: str) -> list[str]:
    if not value:
        return list(DEFAULT_TOPICS)
    return [topic.strip() for topic in value.split(",") if topic.strip()]


def normalize(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def match_topics(text: str, topics: list[str]) -> list[str]:
    found = []
    for topic in topics:
        if re.search(rf"(?<!\w){re.escape(topic)}(?!\w)", text, flags=re.IGNORECASE):
            found.append(topic)
    return found


def tab_score(video: dict[str, Any]) -> int:
    tabs = set(video.get("tabs") or [])
    if "videos" in tabs:
        return 30
    if "streams" in tabs:
        return 18
    if "shorts" in tabs:
        return 6
    return 0


def duration_score(video: dict[str, Any]) -> int:
    duration = video.get("duration")
    if not isinstance(duration, int | float):
        return 0
    if 240 <= duration <= 3600:
        return 20
    if 60 <= duration < 240:
        return 10
    if duration > 3600:
        return 4
    return 0


def score_video(video: dict[str, Any], matches: list[str]) -> int:
    title = video.get("title") or ""
    score = tab_score(video) + duration_score(video) + len(matches) * 12
    if re.search(r"compar|review|prueba|manejo|vale la pena|compr|falla|problema|precio|mejor|peor", title, re.I):
        score += 18
    if re.search(r"shorts?|live|en vivo", title, re.I):
        score -= 8
    return score


def source_from_catalog(catalog: dict[str, Any], fallback: str) -> dict[str, Any]:
    source = catalog.get("source") if isinstance(catalog.get("source"), dict) else {}
    if source:
        return source
    return {
        "source_key": fallback,
        "source_name": catalog.get("channel_title") or fallback,
        "source_channel_id": catalog.get("channel_id") or "",
        "usage_rights": "external-reference",
        "reuse_policy": "embed_link_and_summarize_only",
        "transcript_policy": "do_not_store_full_transcript_without_permission",
    }


def iter_catalogs(external_dir: Path) -> list[tuple[str, Path, dict[str, Any]]]:
    catalogs = []
    for path in sorted(external_dir.glob("*/catalog/videos.json")):
        source_key = path.parts[-3]
        catalogs.append((source_key, path, load_json(path, {})))
    return catalogs


def build_queue(
    external_dir: Path,
    topics: list[str],
    per_topic_source: int,
    max_videos: int,
    min_score: int,
) -> dict[str, Any]:
    candidates: list[dict[str, Any]] = []
    seen: set[str] = set()
    counts: dict[tuple[str, str], int] = {}

    for source_key, catalog_path, catalog in iter_catalogs(external_dir):
        source = source_from_catalog(catalog, source_key)
        for video in catalog.get("videos") or []:
            video_id = video.get("id")
            if not video_id:
                continue
            title = normalize(video.get("title") or "")
            matches = match_topics(title, topics)
            if not matches:
                continue
            score = score_video(video, matches)
            if score < min_score:
                continue
            item = dict(video)
            item["source"] = video.get("source") or source
            item["matched_topics"] = matches
            item["queue_score"] = score
            item["queue_source_catalog"] = str(catalog_path)
            candidates.append(item)

    candidates.sort(key=lambda row: (row.get("queue_score") or 0, row.get("duration") or 0), reverse=True)

    selected = []
    for item in candidates:
        video_id = item.get("id")
        if video_id in seen:
            continue
        source = item.get("source") if isinstance(item.get("source"), dict) else {}
        source_key = source.get("source_key") or "unknown"
        allowed = False
        for topic in item.get("matched_topics") or []:
            key = (source_key, topic)
            if counts.get(key, 0) < per_topic_source:
                allowed = True
                counts[key] = counts.get(key, 0) + 1
        if not allowed:
            continue
        selected.append(item)
        seen.add(video_id)
        if max_videos and len(selected) >= max_videos:
            break

    topic_counts: dict[str, int] = {}
    source_counts: dict[str, int] = {}
    for item in selected:
        source = item.get("source") if isinstance(item.get("source"), dict) else {}
        source_key = source.get("source_key") or "unknown"
        source_counts[source_key] = source_counts.get(source_key, 0) + 1
        for topic in item.get("matched_topics") or []:
            topic_counts[topic] = topic_counts.get(topic, 0) + 1

    return {
        "channel": "mixed-external-sources",
        "channel_title": "Tixuz external knowledge queue",
        "channel_id": "",
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "queue": {
            "topics": topics,
            "per_topic_source": per_topic_source,
            "max_videos": max_videos,
            "min_score": min_score,
            "topic_counts": dict(sorted(topic_counts.items())),
            "source_counts": dict(sorted(source_counts.items())),
        },
        "total_unique": len(selected),
        "videos": selected,
    }


def write_outputs(catalog: dict[str, Any], output_catalog: Path) -> None:
    output_catalog.parent.mkdir(parents=True, exist_ok=True)
    output_catalog.write_text(json.dumps(catalog, ensure_ascii=False, indent=2), encoding="utf-8")
    with output_catalog.with_suffix(".csv").open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "id",
                "title",
                "url",
                "duration",
                "tabs",
                "source_name",
                "source_key",
                "matched_topics",
                "queue_score",
            ],
        )
        writer.writeheader()
        for video in catalog.get("videos") or []:
            source = video.get("source") if isinstance(video.get("source"), dict) else {}
            writer.writerow(
                {
                    "id": video.get("id"),
                    "title": video.get("title"),
                    "url": video.get("url"),
                    "duration": video.get("duration"),
                    "tabs": ",".join(video.get("tabs") or []),
                    "source_name": source.get("source_name"),
                    "source_key": source.get("source_key"),
                    "matched_topics": ",".join(video.get("matched_topics") or []),
                    "queue_score": video.get("queue_score"),
                }
            )


def main() -> None:
    parser = argparse.ArgumentParser(description="Create a mixed-source external video queue by brand/topic.")
    parser.add_argument("--external-dir", default="youtube-library-output/external")
    parser.add_argument("--output-catalog", default="youtube-library-output/knowledge/catalog/topic-queue.json")
    parser.add_argument("--topics", default="")
    parser.add_argument("--per-topic-source", type=int, default=3)
    parser.add_argument("--max-videos", type=int, default=250)
    parser.add_argument("--min-score", type=int, default=35)
    args = parser.parse_args()

    catalog = build_queue(
        Path(args.external_dir),
        split_topics(args.topics),
        args.per_topic_source,
        args.max_videos,
        args.min_score,
    )
    write_outputs(catalog, Path(args.output_catalog))
    print(
        json.dumps(
            {
                "videos": catalog["total_unique"],
                "topic_counts": catalog["queue"]["topic_counts"],
                "source_counts": catalog["queue"]["source_counts"],
                "output_catalog": args.output_catalog,
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
