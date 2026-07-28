#!/usr/bin/env python3
"""Aggregate extracted video claims by vehicle, brand, and source."""

from __future__ import annotations

import argparse
import csv
import json
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_OUTPUT = Path("youtube-library-output")


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8-sig"))


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def clean_text(value: Any) -> str:
    if value is None:
        return ""
    return " ".join(str(value).split())


def normalize_topic(value: Any) -> str:
    topic = clean_text(value)
    return topic if topic else "Sin clasificar"


def discover_claim_dirs(output: Path, include_external: bool) -> list[Path]:
    claim_dirs: list[Path] = []

    for candidate in [
        output / "knowledge" / "claims",
        output / "claims",
    ]:
        if candidate.exists():
            claim_dirs.append(candidate)

    if include_external:
        external_root = output / "external"
        if external_root.exists():
            for candidate in sorted(external_root.glob("*/claims")):
                if candidate.exists():
                    claim_dirs.append(candidate)

    unique_dirs: list[Path] = []
    seen = set()
    for claim_dir in claim_dirs:
        resolved = claim_dir.resolve()
        if resolved not in seen:
            unique_dirs.append(claim_dir)
            seen.add(resolved)
    return unique_dirs


def iter_claim_files(claim_dirs: list[Path]) -> list[Path]:
    files: list[Path] = []
    for claim_dir in claim_dirs:
        for path in sorted(claim_dir.glob("*.json")):
            if path.name.lower() == "index.json":
                continue
            files.append(path)
    return files


def claim_record(path: Path, payload: dict[str, Any], claim: dict[str, Any]) -> dict[str, Any]:
    attribution = payload.get("source_attribution") or {}
    topic = normalize_topic(claim.get("vehicle_or_brand"))
    source_video_id = clean_text(attribution.get("source_video_id"))
    source_url = clean_text(attribution.get("source_url"))
    if not source_url and source_video_id:
        source_url = f"https://www.youtube.com/watch?v={source_video_id}"

    return {
        "topic": topic,
        "claim_summary": clean_text(claim.get("claim_summary")),
        "polarity": clean_text(claim.get("polarity")),
        "claim_type": clean_text(claim.get("claim_type")),
        "buyer_impact": clean_text(claim.get("buyer_impact")),
        "timestamp_start": claim.get("timestamp_start"),
        "confidence": clean_text(claim.get("confidence")),
        "needs_verification": bool(claim.get("needs_verification", True)),
        "extraction_method": clean_text(claim.get("extraction_method")),
        "source_video_id": source_video_id,
        "source_url": source_url,
        "source_title": clean_text(attribution.get("source_title")),
        "source_channel": clean_text(attribution.get("source_channel")),
        "source_channel_id": clean_text(attribution.get("source_channel_id")),
        "source_owner": clean_text(attribution.get("source_owner")),
        "usage_rights": clean_text(attribution.get("usage_rights")),
        "reuse_policy": clean_text(attribution.get("reuse_policy")),
        "content_reuse_policy": clean_text(payload.get("content_reuse_policy")),
        "raw_transcript_stored": bool(payload.get("raw_transcript_stored", False)),
        "transcript_language": clean_text(payload.get("transcript_language")),
        "extraction_provider": clean_text(payload.get("extraction_provider")),
        "generated_at": clean_text(payload.get("generated_at")),
        "claim_file": str(path).replace("\\", "/"),
        "claim_dir": str(path.parent).replace("\\", "/"),
    }


def record_signature(record: dict[str, Any]) -> tuple[Any, ...]:
    return (
        record["topic"].casefold(),
        record["source_video_id"],
        record["claim_summary"].casefold(),
        record["polarity"].casefold(),
        record["claim_type"].casefold(),
        record["timestamp_start"],
    )


def aggregate(records: list[dict[str, Any]]) -> dict[str, Any]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for record in records:
        grouped[record["topic"]].append(record)

    topics: dict[str, Any] = {}
    for topic, topic_records in sorted(
        grouped.items(),
        key=lambda item: (-len(item[1]), item[0].casefold()),
    ):
        source_counts = Counter(record["source_channel"] or "Fuente sin nombre" for record in topic_records)
        polarity_counts = Counter(record["polarity"] or "unknown" for record in topic_records)
        needs_review = sum(1 for record in topic_records if record["needs_verification"])

        topics[topic] = {
            "claim_count": len(topic_records),
            "source_count": len(source_counts),
            "sources": dict(source_counts.most_common()),
            "polarity": dict(polarity_counts.most_common()),
            "needs_editorial_review": needs_review,
            "claims": sorted(
                topic_records,
                key=lambda record: (
                    record["source_channel"].casefold(),
                    record["source_title"].casefold(),
                    record["polarity"].casefold(),
                    record["claim_summary"].casefold(),
                ),
            ),
        }

    channel_counts = Counter(record["source_channel"] or "Fuente sin nombre" for record in records)
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "topic_count": len(topics),
        "claim_count": len(records),
        "source_count": len(channel_counts),
        "sources": dict(channel_counts.most_common()),
        "copyright_guardrails": {
            "raw_transcripts_included": False,
            "external_policy": "embed_link_and_summarize_only",
            "publication_note": "Claims from external videos are candidates. Verify and rewrite editorially before publishing.",
        },
        "topics": topics,
    }


def write_csv(path: Path, records: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = [
        "topic",
        "polarity",
        "claim_type",
        "confidence",
        "needs_verification",
        "buyer_impact",
        "claim_summary",
        "source_channel",
        "source_owner",
        "source_title",
        "source_url",
        "source_video_id",
        "timestamp_start",
        "transcript_language",
        "extraction_provider",
        "extraction_method",
        "content_reuse_policy",
        "usage_rights",
        "reuse_policy",
        "raw_transcript_stored",
        "claim_file",
        "claim_dir",
    ]
    with path.open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for record in records:
            writer.writerow({field: record.get(field, "") for field in fieldnames})


def write_summary(path: Path, aggregated: dict[str, Any], top: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = [
        "# Tixuz Autos - Claims por tema",
        "",
        f"Generado: {aggregated['generated_at']}",
        f"Temas: {aggregated['topic_count']}",
        f"Claims: {aggregated['claim_count']}",
        f"Fuentes: {aggregated['source_count']}",
        "",
        "Uso editorial: estas son pistas y opiniones atribuidas desde videos publicos o propios. No contienen transcripcion completa; antes de publicar, verificar y reescribir con voz editorial de Tixuz.",
        "",
        "## Fuentes",
    ]
    for source, count in aggregated["sources"].items():
        lines.append(f"- {source}: {count}")

    lines.extend(["", "## Temas principales"])
    for index, (topic, data) in enumerate(aggregated["topics"].items(), start=1):
        if index > top:
            break
        sources = ", ".join(f"{name} ({count})" for name, count in list(data["sources"].items())[:4])
        polarity = ", ".join(f"{name}: {count}" for name, count in data["polarity"].items())
        lines.append(f"- {topic}: {data['claim_count']} claims; fuentes: {sources}; polaridad: {polarity}")

    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Aggregate safe YouTube claim files by vehicle/brand topic.")
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT), help="Base youtube-library-output directory.")
    parser.add_argument("--claims-dir", action="append", help="Specific claims directory. Can be passed more than once.")
    parser.add_argument("--include-external", action="store_true", help="Include youtube-library-output/external/*/claims.")
    parser.add_argument("--json-out", help="Output JSON path.")
    parser.add_argument("--csv-out", help="Output CSV path.")
    parser.add_argument("--summary-out", help="Output Markdown summary path.")
    parser.add_argument("--summary-top", type=int, default=30)
    args = parser.parse_args()

    output = Path(args.output)
    if args.claims_dir:
        claim_dirs = [Path(item) for item in args.claims_dir]
    else:
        claim_dirs = discover_claim_dirs(output, args.include_external)

    seen_signatures = set()
    records: list[dict[str, Any]] = []
    failed: list[dict[str, str]] = []

    for path in iter_claim_files(claim_dirs):
        try:
            payload = read_json(path)
            claims = payload.get("claims") or []
            for claim in claims:
                record = claim_record(path, payload, claim)
                signature = record_signature(record)
                if signature in seen_signatures:
                    continue
                seen_signatures.add(signature)
                records.append(record)
        except Exception as exc:  # pragma: no cover - CLI diagnostics
            failed.append({"path": str(path), "error": str(exc)})

    records.sort(
        key=lambda record: (
            record["topic"].casefold(),
            record["source_channel"].casefold(),
            record["source_title"].casefold(),
        )
    )
    aggregated = aggregate(records)
    aggregated["source_dirs"] = [str(path).replace("\\", "/") for path in claim_dirs]
    aggregated["failed_files"] = failed

    json_out = Path(args.json_out) if args.json_out else output / "knowledge" / "claims_by_topic.json"
    csv_out = Path(args.csv_out) if args.csv_out else output / "knowledge" / "claims_by_topic.csv"
    summary_out = Path(args.summary_out) if args.summary_out else output / "knowledge" / "claims_summary.md"

    write_json(json_out, aggregated)
    write_csv(csv_out, records)
    write_summary(summary_out, aggregated, args.summary_top)

    print(json.dumps({
        "claim_dirs": [str(path) for path in claim_dirs],
        "claims": len(records),
        "topics": aggregated["topic_count"],
        "sources": aggregated["source_count"],
        "json": str(json_out),
        "csv": str(csv_out),
        "summary": str(summary_out),
        "failed": len(failed),
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
