#!/usr/bin/env python3
"""Package an immutable backup without changing the directory being read by tar."""
import os
from pathlib import Path
import subprocess
import sys
import tempfile


def package(stage_value, destination_value):
    stage = Path(stage_value).resolve(strict=True)
    destination = Path(destination_value).absolute()
    if destination == stage or stage in destination.resolve().parents:
        raise ValueError("The package destination must be outside the backup input directory")
    if destination.exists() or destination.is_symlink():
        raise FileExistsError("The package destination already exists")
    for name in ("SHA256SUMS", "manifest.json", "backup", "recovery"):
        member = stage / name
        if member.is_symlink() or not member.exists():
            raise ValueError("The complete backup manifest, data and recovery inputs are required")
    descriptor, temporary = tempfile.mkstemp(prefix=".war-archive-package-", suffix=".partial", dir=destination.parent)
    os.close(descriptor)
    try:
        subprocess.run(["tar", "-C", str(stage), "-czf", temporary, "SHA256SUMS", "manifest.json", "backup", "recovery"], check=True)
        # Create the final pathname exclusively; never replace an existing backup.
        os.link(temporary, destination)
    finally:
        Path(temporary).unlink()
    return destination


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("Usage: package-backup.py immutable-backup-directory new-output-outside-input")
    os.umask(0o077)
    package(*sys.argv[1:])
