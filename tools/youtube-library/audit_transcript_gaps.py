#!/usr/bin/env python3
"""Report owned Tixuz videos that need transcripts for editorial briefs."""

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path
from typing import Any


DEFAULT_OUTPUT = Path("youtube-library-output")


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8-sig"))


def main() -> None:
    parser = argparse.ArgumentParser(description="Audit missing owned transcripts from topic briefs.")
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT))
    parser.add_argument("--briefs-index", help="Path to knowledge/briefs/index.json.")
    parser.add_argument("--brief-records-dir", help="Path to knowledge/briefs/records.")
    parser.add_argument("--csv-out", help="Output CSV path.")
    parser.add_argument("--json-out", help="Output JSON path.")
    args = parser.parse_args()

    output = Path(args.output)
    index_path = Path(args.briefs_index) if args.briefs_index else output / "knowledge" / "briefs" / "index.json"
    records_dir = Path(args.brief_records_dir) if args.brief_records_dir else output / "knowledge" / "briefs" / "records"
    csv_out = Path(args.csv_out) if args.csv_out else output / "knowledge" / "briefs" / "transcript_gaps.csv"
    json_out = Path(args.json_out) if args.json_out else output / "knowledge" / "briefs" / "transcript_gaps.json"

    index = read_json(index_path) if index_path.exists() else []
    score_by_topic = {item.get("topic"): int(item.get("publication_score") or 0) for item in index}

    rows: list[dict[str, Any]] = []
    seen = set()
    for path in sorted(records_dir.glob("*.json")):
        record = read_json(path)
        topic = record.get("topic") or path.stem
        for video in record.get("owned_tixuz_videos") or []:
            key = (topic, video.get("id"))
            if key in seen:
                continue
            seen.add(key)
            has_transcript = bool(video.get("transcript_available"))
            rows.append({
                "topic": topic,
                "publication_score": score_by_topic.get(topic, record.get("publication_score") or 0),
                "video_id": video.get("id") or "",
                "title": video.get("title") or "",
                "url": video.get("url") or "",
                "transcript_available": has_transcript,
                "transcript_chars": int(video.get("transcript_chars") or 0),
                "priority": "high" if not has_transcript and score_by_topic.get(topic, 0) >= 60 else "normal",
            })

    rows.sort(key=lambda row: (row["transcript_available"], -int(row["publication_score"]), row["topic"], row["title"]))
    csv_out.parent.mkdir(parents=True, exist_ok=True)
    with csv_out.open("w", newline="", encoding="utf-8-sig") as handle:
        fieldnames = ["priority", "topic", "publication_score", "video_id", "title", "url", "transcript_available", "transcript_chars"]
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow(row)

    summary = {
        "total_owned_videos_in_briefs": len(rows),
        "missing_transcripts": sum(1 for row in rows if not row["transcript_available"]),
        "available_transcripts": sum(1 for row in rows if row["transcript_available"]),
        "high_priority_missing": sum(1 for row in rows if row["priority"] == "high"),
        "rows": rows,
    }
    json_out.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({
        "total": summary["total_owned_videos_in_briefs"],
        "missing": summary["missing_transcripts"],
        "available": summary["available_transcripts"],
        "high_priority_missing": summary["high_priority_missing"],
        "csv": str(csv_out),
        "json": str(json_out),
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
