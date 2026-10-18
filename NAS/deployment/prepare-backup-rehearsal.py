#!/usr/bin/env python3
"""Authenticate an external copy and prepare a NEW private NAS rehearsal folder."""
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import sys
import tarfile


def prepare(root_value, directory_value, commit, key):
    root = Path(root_value).resolve(strict=True)
    directory = Path(directory_value)
    if directory.is_symlink() or directory.resolve(strict=True).parent != root / "artifacts" or not re.fullmatch(r"external-retrieval-[a-f0-9-]{36}", directory.name):
        raise ValueError("A dedicated newly retrieved rehearsal directory is required")
    if not re.fullmatch(r"[a-f0-9]{40}", commit) or not re.fullmatch(rb"[A-Za-z0-9+/]{43}=", key):
        raise ValueError("Invalid backup key or image commit")
    source = directory / "external.tar.gz.enc"
    if source.is_symlink() or not source.is_file() or source.stat().st_size <= 32:
        raise ValueError("The retrieved encrypted backup is missing")
    target = directory / "restored"
    target.mkdir(mode=0o700)  # Existing destinations are always rejected.
    docker = ["/usr/local/bin/docker"]
    if os.getuid() != 0:
        docker.insert(0, "sudo")
        docker.insert(1, "-n")
    subprocess.run(docker + ["run", "--rm", "-i", "--network", "none", "--read-only", "--cap-drop", "ALL", "--security-opt", "no-new-privileges:true", "--user", f"{os.getuid()}:{os.getgid()}", "--mount", f"type=bind,src={directory},dst=/rehearsal", "--mount", f"type=bind,src={root}/deployment/encrypt-backup.mjs,dst=/encrypt-backup.mjs,readonly", "--entrypoint", "node", f"war-archive-backend:{commit}", "/encrypt-backup.mjs", "decrypt", "/rehearsal/external.tar.gz.enc", "/rehearsal/bundle.tar.gz", "--key-stdin"], input=key + b"\n", stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True, timeout=900)
    total = 0
    with tarfile.open(directory / "bundle.tar.gz", "r:gz") as archive:
        members = archive.getmembers()
        for member in members:
            name = PurePosixPath(member.name)
            if name.is_absolute() or ".." in name.parts or not (member.isfile() or member.isdir()) or member.size < 0:
                raise ValueError("Unsafe restored archive entry")
            total += member.size
            if total > 20 * 1024 ** 3 or len(members) > 1000:
                raise ValueError("Restored archive exceeds the rehearsal limit")
        for member in members:
            output = target.joinpath(*PurePosixPath(member.name).parts)
            if member.isdir():
                output.mkdir(mode=0o700, parents=True, exist_ok=True)
            else:
                output.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
                with archive.extractfile(member) as source_file, output.open("xb") as output_file:
                    shutil.copyfileobj(source_file, output_file, 1024 * 1024)
                output.chmod(0o600)
    expected = {"manifest.json", "backup/database.dump", "backup/archive-files.tar", "backup/releases.tar", "backup/database-contents.txt", "backup/SHA256SUMS", "recovery/environment.env", "recovery/secrets.tar", "recovery/source-and-bootstrap.tar.gz", "recovery/runtime-images.tar.gz", "recovery/image-identities.txt"}
    checked = set()
    for line in (target / "SHA256SUMS").read_text().splitlines():
        match = re.fullmatch(r"([a-f0-9]{64})  (.+)", line)
        if not match or match[2] not in expected or match[2] in checked:
            raise ValueError("Invalid full recovery checksum manifest")
        digest = hashlib.sha256()
        with (target / match[2]).open("rb") as file:
            for chunk in iter(lambda: file.read(1024 * 1024), b""):
                digest.update(chunk)
        if digest.hexdigest() != match[1]:
            raise ValueError("Full recovery checksum differs")
        checked.add(match[2])
    if checked != expected:
        raise ValueError("The full recovery backup is incomplete")
    manifest = json.loads((target / "manifest.json").read_text())
    if manifest.get("version") != 1 or manifest.get("commit") != commit or manifest.get("keyIncluded") is not False:
        raise ValueError("The recovery metadata differs")
    return {"operation": "backup.external.retrieval", "status": "authenticated-and-unpacked", "directory": str(target), "commit": commit, "checksums": len(checked)}


if __name__ == "__main__":
    try:
        os.umask(0o077)
        if len(sys.argv) != 4:
            raise ValueError("Usage: prepare-backup-rehearsal.py dedicated-root fresh-retrieval-dir image-commit")
        result = prepare(*sys.argv[1:], sys.stdin.buffer.readline(100).strip())
        print(json.dumps(result))
    except Exception as error:
        # Do not print child diagnostics or any private recovery file contents.
        print(json.dumps({"operation": "backup.external.retrieval", "status": "failed", "reason": type(error).__name__}), file=sys.stderr)
        sys.exit(1)
