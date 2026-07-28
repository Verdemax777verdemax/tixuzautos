#!/usr/bin/env python3
"""Import local transcript files exported from YouTube Studio, Takeout, or manual notes."""

from __future__ import annotations

import argparse
import csv
import json
import re
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


SUPPORTED_SUFFIXES = {".txt", ".srt", ".vtt", ".json"}
YOUTUBE_ID_RE = re.compile(r"(?<![A-Za-z0-9_-])([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])")


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8-sig"))


def load_catalog(path: Path) -> list[dict[str, Any]]:
    data = read_json(path)
    return data.get("videos", []) if isinstance(data, dict) else data


def normalize(value: str) -> str:
    text = unicodedata.normalize("NFKD", value or "")
    text = text.encode("ascii", "ignore").decode("ascii")
    text = re.sub(r"[^a-zA-Z0-9]+", " ", text).strip().casefold()
    return text


def catalog_maps(videos: list[dict[str, Any]]) -> tuple[dict[str, dict[str, Any]], dict[str, dict[str, Any]]]:
    by_id: dict[str, dict[str, Any]] = {}
    by_title: dict[str, dict[str, Any]] = {}
    for video in videos:
        video_id = str(video.get("id") or "")
        if video_id:
            by_id[video_id] = video
        title = normalize(str(video.get("title") or ""))
        if title:
            by_title[title] = video
    return by_id, by_title


def find_video_id(path: Path, text: str, by_id: dict[str, dict[str, Any]], by_title: dict[str, dict[str, Any]]) -> str:
    candidates = [path.stem, path.name, str(path)]
    candidates.extend(YOUTUBE_ID_RE.findall(text[:2000]))
    for candidate in candidates:
        match = YOUTUBE_ID_RE.search(candidate)
        if match and match.group(1) in by_id:
            return match.group(1)
        if candidate in by_id:
            return candidate

    stem = normalize(path.stem)
    if stem in by_title:
        return str(by_title[stem].get("id") or "")

    best_id = ""
    best_score = 0
    stem_words = set(stem.split())
    if len(stem_words) >= 3:
        for title, video in by_title.items():
            words = set(title.split())
            if not words:
                continue
            score = len(stem_words & words)
            if score > best_score and score >= min(5, max(3, len(stem_words) // 2)):
                best_id = str(video.get("id") or "")
                best_score = score
    return best_id


def strip_caption_noise(text: str) -> str:
    lines: list[str] = []
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        if line.upper() == "WEBVTT":
            continue
        if re.fullmatch(r"\d+", line):
            continue
        if "-->" in line:
            continue
        if re.match(r"^(Kind|Language):", line, re.I):
            continue
        line = re.sub(r"<[^>]+>", "", line)
        line = re.sub(r"\{\\.*?\}", "", line)
        line = re.sub(r"\s+", " ", line).strip()
        if line:
            lines.append(line)
    return " ".join(lines)


def transcript_from_json(path: Path) -> tuple[str, list[dict[str, Any]], str]:
    payload = read_json(path)
    language = ""
    if isinstance(payload, dict):
        language = str(payload.get("language_code") or payload.get("language") or "")
        if isinstance(payload.get("segments"), list):
            segments = payload["segments"]
            text = " ".join(str(segment.get("text") or "").strip() for segment in segments if isinstance(segment, dict))
            return text, segments, language
        if isinstance(payload.get("text"), str):
            return payload["text"], [{"text": payload["text"], "start": None, "duration": None}], language
        if isinstance(payload.get("transcript"), str):
            return payload["transcript"], [{"text": payload["transcript"], "start": None, "duration": None}], language
    if isinstance(payload, list):
        parts = []
        segments = []
        for item in payload:
            if isinstance(item, dict):
                text = str(item.get("text") or item.get("caption") or "").strip()
                if text:
                    parts.append(text)
                    segments.append({
                        "text": text,
                        "start": item.get("start"),
                        "duration": item.get("duration"),
                    })
        return " ".join(parts), segments, language
    return "", [], language


def parse_transcript_file(path: Path) -> tuple[str, list[dict[str, Any]], str]:
    if path.suffix.lower() == ".json":
        text, segments, language = transcript_from_json(path)
    else:
        raw = path.read_text(encoding="utf-8-sig", errors="ignore")
        text = strip_caption_noise(raw)
        segments = [{"text": text, "start": None, "duration": None}] if text else []
        language = ""
    text = " ".join(text.split())
    return text, segments, language


def iter_files(input_dir: Path) -> list[Path]:
    files = []
    for path in input_dir.rglob("*"):
        if path.is_file() and path.suffix.lower() in SUPPORTED_SUFFIXES:
            files.append(path)
    return sorted(files)


def main() -> None:
    parser = argparse.ArgumentParser(description="Import local transcript files into youtube-library-output/transcripts.")
    parser.add_argument("--input-dir", required=True, help="Folder containing .txt, .srt, .vtt, or .json transcript files.")
    parser.add_argument("--catalog", default="youtube-library-output/catalog/videos.json")
    parser.add_argument("--output", default="youtube-library-output")
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    input_dir = Path(args.input_dir)
    output = Path(args.output)
    videos = load_catalog(Path(args.catalog))
    by_id, by_title = catalog_maps(videos)

    transcript_dir = output / "transcripts"
    text_dir = transcript_dir / "txt"
    transcript_dir.mkdir(parents=True, exist_ok=True)
    text_dir.mkdir(parents=True, exist_ok=True)

    imported = 0
    skipped = 0
    failed = 0
    rows: list[dict[str, Any]] = []

    for path in iter_files(input_dir):
        try:
            raw_preview = path.read_text(encoding="utf-8-sig", errors="ignore")[:4000] if path.suffix.lower() != ".json" else ""
            video_id = find_video_id(path, raw_preview, by_id, by_title)
            if not video_id:
                skipped += 1
                rows.append({"file": str(path), "ok": False, "reason": "no_catalog_match"})
                continue

            json_path = transcript_dir / f"{video_id}.json"
            txt_path = text_dir / f"{video_id}.txt"
            if json_path.exists() and not args.force:
                skipped += 1
                rows.append({"file": str(path), "video_id": video_id, "ok": False, "reason": "already_exists"})
                continue

            text, segments, language = parse_transcript_file(path)
            if not text:
                skipped += 1
                rows.append({"file": str(path), "video_id": video_id, "ok": False, "reason": "empty_transcript"})
                continue

            transcript = {
                "video_id": video_id,
                "language": language or "unknown",
                "language_code": language or "",
                "is_generated": None,
                "is_translatable": None,
                "fetched_at": datetime.now(timezone.utc).isoformat(),
                "provider": "local_import",
                "source_file": str(path),
                "segments": segments,
                "text": text,
            }
            json_path.write_text(json.dumps(transcript, ensure_ascii=False, indent=2), encoding="utf-8")
            txt_path.write_text(text, encoding="utf-8")
            imported += 1
            rows.append({"file": str(path), "video_id": video_id, "ok": True, "chars": len(text)})
        except Exception as exc:
            failed += 1
            rows.append({"file": str(path), "ok": False, "reason": type(exc).__name__, "detail": str(exc)})

    manifest_json = transcript_dir / "local_import_manifest.json"
    manifest_csv = transcript_dir / "local_import_manifest.csv"
    manifest_json.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    with manifest_csv.open("w", newline="", encoding="utf-8-sig") as handle:
        fieldnames = ["file", "video_id", "ok", "chars", "reason", "detail"]
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow({field: row.get(field, "") for field in fieldnames})

    print(json.dumps({
        "imported": imported,
        "skipped": skipped,
        "failed": failed,
        "manifest_json": str(manifest_json),
        "manifest_csv": str(manifest_csv),
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
