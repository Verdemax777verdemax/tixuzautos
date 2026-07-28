#!/usr/bin/env python3
"""Copy the generated YouTube library to a durable local folder."""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path


DEFAULT_BACKUP = Path.home() / "Documents" / "TixuzAutos-Biblioteca"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def copy_tree(source: Path, target: Path) -> None:
    if not source.exists():
        return
    if target.exists():
        shutil.rmtree(target)
    shutil.copytree(source, target, dirs_exist_ok=True)


def manifest(root: Path) -> dict[str, object]:
    files = []
    for path in root.rglob("*"):
        if path.is_file():
            files.append({
                "path": str(path.relative_to(root)).replace("\\", "/"),
                "bytes": path.stat().st_size,
                "sha256": sha256(path),
            })
    return {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "root": str(root),
        "file_count": len(files),
        "total_bytes": sum(item["bytes"] for item in files),
        "files": files,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Backup Tixuz generated library to local CPU storage.")
    parser.add_argument("--output", default="youtube-library-output")
    parser.add_argument("--backup-dir", default=str(DEFAULT_BACKUP))
    args = parser.parse_args()

    source = Path(args.output)
    backup = Path(args.backup_dir)
    backup.mkdir(parents=True, exist_ok=True)

    for name in ["catalog", "details", "transcripts", "claims", "facts-ai", "enriched", "enriched-ai", "enriched-ai-strict", "fichas", "external", "knowledge"]:
        copy_tree(source / name, backup / name)

    tool_dir = Path(__file__).resolve().parent
    copy_tree(tool_dir, backup / "sistema" / "youtube-library")

    backup.joinpath("MANIFEST.json").write_text(json.dumps(manifest(backup), ensure_ascii=False, indent=2), encoding="utf-8")
    backup.joinpath("LEEME.txt").write_text(
        "Copia local de la biblioteca Tixuz Autos generada desde YouTube.\n"
        "Contiene catalogo, metadatos, transcripciones disponibles, fichas JSON, Markdown, HTML y claims por tema.\n",
        encoding="utf-8",
    )
    print(json.dumps({"backup_dir": str(backup), "manifest": str(backup / "MANIFEST.json")}, ensure_ascii=False))


if __name__ == "__main__":
    main()
