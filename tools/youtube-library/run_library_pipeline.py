#!/usr/bin/env python3
"""Run the Tixuz YouTube library pipeline end to end."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent


def run_step(args: list[str]) -> dict[str, object]:
    completed = subprocess.run([sys.executable, *args], cwd=Path.cwd(), check=True, capture_output=True, text=True)
    stdout = completed.stdout.strip().splitlines()
    last = stdout[-1] if stdout else "{}"
    try:
        return json.loads(last)
    except json.JSONDecodeError:
        return {"output": completed.stdout.strip()}


def main() -> None:
    parser = argparse.ArgumentParser(description="Run catalog, details, transcripts, enrichment, export, and backup.")
    parser.add_argument("--channel", default="@Tixuz")
    parser.add_argument("--output", default="youtube-library-output")
    parser.add_argument("--backup-dir", default="")
    parser.add_argument("--details-limit", type=int, default=100)
    parser.add_argument("--transcript-limit", type=int, default=25)
    parser.add_argument("--enrich-limit", type=int, default=25)
    parser.add_argument("--ai", action="store_true")
    parser.add_argument("--provider-config", default="")
    parser.add_argument("--source-key", default="tixuz")
    parser.add_argument("--source-name", default="")
    parser.add_argument("--source-owner", default="Eduardo Vargas")
    parser.add_argument("--source-url", default="")
    parser.add_argument("--usage-rights", choices=["owned", "authorized", "external-reference"], default="owned")
    parser.add_argument("--relationship", default="owned-channel")
    parser.add_argument("--permission-note", default="")
    parser.add_argument("--allow-external-transcripts", action="store_true")
    args = parser.parse_args()

    output = args.output
    results: dict[str, object] = {}
    results["catalog"] = run_step([
        str(ROOT / "fetch_catalog.py"),
        "--channel",
        args.channel,
        "--output",
        output,
        "--source-key",
        args.source_key,
        "--source-name",
        args.source_name,
        "--source-owner",
        args.source_owner,
        "--source-url",
        args.source_url,
        "--usage-rights",
        args.usage_rights,
        "--relationship",
        args.relationship,
        "--permission-note",
        args.permission_note,
    ])
    results["details"] = run_step([str(ROOT / "fetch_details.py"), "--catalog", f"{output}/catalog/videos.json", "--output", output, "--limit", str(args.details_limit)])
    transcript_args = [
        str(ROOT / "fetch_transcripts.py"),
        "--catalog",
        f"{output}/catalog/videos.json",
        "--output",
        output,
        "--limit",
        str(args.transcript_limit),
        "--sleep",
        "1.5",
    ]
    if args.allow_external_transcripts:
        transcript_args.append("--allow-external")
    results["transcripts"] = run_step(transcript_args)

    if args.ai:
        enrich_args = [
            str(ROOT / "enrich_with_router.py"),
            "--catalog",
            f"{output}/catalog/videos.json",
            "--output",
            output,
            "--limit",
            str(args.enrich_limit),
            "--allow-local-fallback",
        ]
        if args.provider_config:
            enrich_args.extend(["--provider-config", args.provider_config])
        results["enrich"] = run_step(enrich_args)
    else:
        results["enrich"] = run_step([str(ROOT / "enrich_records.py"), "--catalog", f"{output}/catalog/videos.json", "--output", output, "--limit", str(args.enrich_limit)])

    results["fichas"] = run_step([str(ROOT / "materialize_fichas.py"), "--catalog", f"{output}/catalog/videos.json", "--output", output, "--limit", str(args.enrich_limit)])
    backup_args = [str(ROOT / "backup_library.py"), "--output", output]
    if args.backup_dir:
        backup_args.extend(["--backup-dir", args.backup_dir])
    results["backup"] = run_step(backup_args)
    print(json.dumps(results, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
