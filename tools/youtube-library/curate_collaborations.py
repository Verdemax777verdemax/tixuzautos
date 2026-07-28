#!/usr/bin/env python3
"""Create a smaller catalog of collaboration videos from an external channel."""

from __future__ import annotations

import argparse
import csv
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_TERMS = ("tixuz", "lalo", "eduardo", "vargas")


def load_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8-sig"))


def split_terms(value: str) -> list[str]:
    if not value:
        return list(DEFAULT_TERMS)
    return [term.strip().lower() for term in value.split(",") if term.strip()]


def text_for_video(video: dict[str, Any], details_dir: Path) -> str:
    details = load_json(details_dir / f"{video.get('id')}.json", {})
    parts = [
        video.get("title") or "",
        details.get("title") or "",
        details.get("description") or "",
    ]
    return re.sub(r"\s+", " ", " ".join(parts)).lower()


def matches(video: dict[str, Any], details_dir: Path, terms: list[str]) -> list[str]:
    haystack = text_for_video(video, details_dir)
    return [term for term in terms if term in haystack]


def write_csv(path: Path, videos: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=["id", "title", "url", "duration", "timestamp", "matched_terms", "source_name", "usage_rights"],
        )
        writer.writeheader()
        for video in videos:
            source = video.get("source") if isinstance(video.get("source"), dict) else {}
            writer.writerow(
                {
                    "id": video.get("id"),
                    "title": video.get("title"),
                    "url": video.get("url"),
                    "duration": video.get("duration"),
                    "timestamp": video.get("timestamp"),
                    "matched_terms": ",".join(video.get("matched_terms") or []),
                    "source_name": source.get("source_name"),
                    "usage_rights": source.get("usage_rights"),
                }
            )


def main() -> None:
    parser = argparse.ArgumentParser(description="Filter an external catalog to likely Tixuz collaborations.")
    parser.add_argument("--catalog", required=True)
    parser.add_argument("--output-catalog", required=True)
    parser.add_argument("--details-dir", default="")
    parser.add_argument("--terms", default=",".join(DEFAULT_TERMS))
    parser.add_argument("--limit", type=int, default=0)
    args = parser.parse_args()

    catalog_path = Path(args.catalog)
    catalog = load_json(catalog_path, {})
    output_catalog = Path(args.output_catalog)
    details_dir = Path(args.details_dir) if args.details_dir else catalog_path.parent.parent / "details"
    terms = split_terms(args.terms)

    selected = []
    for video in catalog.get("videos", []):
        found_terms = matches(video, details_dir, terms)
        if not found_terms:
            continue
        copy = dict(video)
        copy["matched_terms"] = found_terms
        copy["collaboration_context"] = {
            "curated_at": datetime.now(timezone.utc).isoformat(),
            "matched_terms": found_terms,
            "curation_note": "Likely collaboration or mention involving Tixuz/Eduardo Vargas. Review before publishing.",
        }
        selected.append(copy)
        if args.limit and len(selected) >= args.limit:
            break

    curated = {
        **catalog,
        "curated_from": str(catalog_path),
        "curated_at": datetime.now(timezone.utc).isoformat(),
        "curation_terms": terms,
        "total_unique": len(selected),
        "videos": selected,
    }
    output_catalog.parent.mkdir(parents=True, exist_ok=True)
    output_catalog.write_text(json.dumps(curated, ensure_ascii=False, indent=2), encoding="utf-8")
    write_csv(output_catalog.with_suffix(".csv"), selected)
    print(json.dumps({"curated": len(selected), "output_catalog": str(output_catalog)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
