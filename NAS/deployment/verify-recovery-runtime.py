#!/usr/bin/env python3
"""Verify recovery settings/source/images; reload only already-identical image tags."""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import subprocess
import tarfile


def safe_archive(archive):
    members = archive.getmembers()
    if len(members) > 10000:
        raise ValueError("Too many recovery archive entries")
    for member in members:
        path = PurePosixPath(member.name)
        if path.is_absolute() or ".." in path.parts or not (member.isfile() or member.isdir()):
            raise ValueError("Unsafe recovery archive entry")
    return {member.name.rstrip("/"): member for member in members}


def verify(directory_value, load_images=False):
    root = Path(directory_value).resolve(strict=True)
    if root.name != "restored" or not re.fullmatch(r"external-retrieval-[a-f0-9-]{36}", root.parent.name):
        raise ValueError("An authenticated external retrieval directory is required")
    manifest = json.loads((root / "manifest.json").read_text())
    commit = manifest.get("commit", "")
    if not re.fullmatch(r"[a-f0-9]{40}", commit) or manifest.get("scope") != "war-archive-application":
        raise ValueError("Invalid recovery manifest")
    expected = {"manifest.json", "backup/database.dump", "backup/archive-files.tar", "backup/releases.tar", "backup/database-contents.txt", "backup/SHA256SUMS", "recovery/environment.env", "recovery/secrets.tar", "recovery/source-and-bootstrap.tar.gz", "recovery/runtime-images.tar.gz", "recovery/image-identities.txt"}
    checked = set()
    for line in (root / "SHA256SUMS").read_text().splitlines():
        match = re.fullmatch(r"([a-f0-9]{64})  (.+)", line)
        if not match or match[2] not in expected or match[2] in checked:
            raise ValueError("Invalid recovery checksum manifest")
        digest = hashlib.sha256()
        with (root / match[2]).open("rb") as file:
            for chunk in iter(lambda: file.read(1024 * 1024), b""):
                digest.update(chunk)
        if digest.hexdigest() != match[1]:
            raise ValueError("Recovery checksum differs")
        checked.add(match[2])
    if checked != expected:
        raise ValueError("Recovery checksum entries are missing")
    environment = root / "recovery/environment.env"
    if environment.stat().st_mode & 0o077 or environment.stat().st_size < 100:
        raise ValueError("Recovery environment permissions or content are invalid")
    with tarfile.open(root / "recovery/secrets.tar", "r:") as archive:
        members = safe_archive(archive)
        if set(members) != {"github_deploy_key", "github_known_hosts"} or members["github_deploy_key"].mode & 0o077 or any(member.size < 50 for member in members.values()):
            raise ValueError("Recovery deploy-key archive is incomplete or insecure")
    with tarfile.open(root / "recovery/source-and-bootstrap.tar.gz", "r:gz") as archive:
        members = safe_archive(archive)
        required = {f"releases/{commit}/Dockerfile", f"releases/{commit}/compose.deploy.json", f"releases/{commit}/release-source.json", "deployment/controller.mjs", "deployment/update.sh", "state/current.json", "state/current-commit"}
        if not required.issubset(members):
            raise ValueError("Recovery source or bootstrap is incomplete")
        if archive.extractfile("state/current-commit").read().decode().strip() != commit:
            raise ValueError("Recovered deployment state differs")
        state = json.load(archive.extractfile("state/current.json"))
        if state.get("commit") != commit:
            raise ValueError("Recovered deployment state JSON differs")
    expected_images = {}
    targets = {f"war-archive-backend:{commit}", f"war-archive-gateway:{commit}", "postgres:17-alpine"}
    for line in (root / "recovery/image-identities.txt").read_text().splitlines():
        identifier, tags = line.split(" ", 1)
        if not re.fullmatch(r"sha256:[a-f0-9]{64}", identifier):
            raise ValueError("Invalid recovery image identity")
        for tag in json.loads(tags):
            if tag in targets:
                if tag in expected_images:
                    raise ValueError("Duplicate recovery image tag")
                expected_images[tag] = identifier
    if set(expected_images) != targets:
        raise ValueError("Recovery image identities are incomplete")
    with tarfile.open(root / "recovery/runtime-images.tar.gz", "r:gz") as archive:
        members = safe_archive(archive)
        saved = json.load(archive.extractfile("manifest.json"))
        archived = {}
        for image in saved:
            config = image["Config"]
            if config not in members:
                raise ValueError("The saved image configuration is missing")
            config_hash = hashlib.sha256(archive.extractfile(config).read()).hexdigest()
            for tag in image.get("RepoTags", []):
                if tag not in targets or tag in archived:
                    raise ValueError("The image archive would alter an unexpected tag")
                archived[tag] = "sha256:" + config_hash
        if archived != expected_images:
            raise ValueError("Saved image configurations differ from the recorded identities")
    docker = ["/usr/local/bin/docker"]
    if os.getuid() != 0:
        docker = ["sudo", "-n"] + docker
    def current(tag):
        return subprocess.check_output(docker + ["image", "inspect", "--format", "{{.Id}}", tag], stderr=subprocess.DEVNULL, timeout=30).decode().strip()
    # Refuse to reload any tag that now points at a different image, including shared PostgreSQL.
    for tag, identifier in expected_images.items():
        if current(tag) != identifier:
            raise ValueError("A current image tag changed; no images were loaded")
    if load_images:
        subprocess.run(docker + ["image", "load", "--input", str(root / "recovery/runtime-images.tar.gz")], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=900, check=True)
        for tag, identifier in expected_images.items():
            if current(tag) != identifier:
                raise ValueError("An image identity differs after archive load")
    return {"operation": "backup.recovery.runtime", "status": "verified", "commit": commit, "checksums": len(checked), "settingsPrivate": True, "sourceAndBootstrap": True, "runtimeImages": len(expected_images), "actualImageLoad": load_images}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("directory")
    parser.add_argument("--load-images", action="store_true")
    arguments = parser.parse_args()
    try:
        print(json.dumps(verify(arguments.directory, arguments.load_images)))
    except Exception as error:
        print(json.dumps({"operation": "backup.recovery.runtime", "status": "failed", "reason": type(error).__name__}), file=__import__("sys").stderr)
        raise SystemExit(1)
