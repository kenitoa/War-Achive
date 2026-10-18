#!/usr/bin/env python3
"""Validate and add an immutable historical-file bundle; never changes a DB."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import tarfile
import time
import uuid

LABEL = "org.war-archive.historical-repair"


def run_container(docker, options, name, timeout=1800):
    """Keep the caller's deployment lock until this exact container has exited."""
    def call(arguments, capture=False):
        return subprocess.run(docker + arguments, check=True, timeout=60, stdout=subprocess.PIPE if capture else None, encoding="utf-8")

    def state():
        return json.loads(call(["inspect", "--format", "{{json .State}}", name], True).stdout)

    created = False
    try:
        call(["create", "--name", name, "--label", LABEL + "=" + name] + options, True)
        created = True
        call(["start", name], True)
        until = time.monotonic() + timeout
        while True:
            observed = state()
            if not observed["Running"]:
                call(["logs", name])
                if observed["ExitCode"] != 0:
                    raise RuntimeError("Historical installer exited unsuccessfully")
                return
            if time.monotonic() >= until:
                raise TimeoutError("Historical installer exceeded its bounded runtime")
            time.sleep(2)
    finally:
        if created:
            label = call(["inspect", "--format", '{{index .Config.Labels "%s"}}' % LABEL, name], True).stdout.strip()
            if label != name:
                raise RuntimeError("Refusing to manage a container without this invocation's exact label")
            if state()["Running"]:
                call(["stop", "--time", "30", name], True)
                if state()["Running"]:
                    raise RuntimeError("Historical installer did not stop; container retained for inspection")
            # No volumes, images, networks, or existing services are removed.
            call(["rm", name], True)


def extract_verified(bundle, expected, destination):
    if not re.fullmatch(r"[a-f0-9]{64}", expected) or hashlib.sha256(bundle.read_bytes()).hexdigest() != expected:
        raise ValueError("Historical bundle checksum mismatch")
    with tarfile.open(str(bundle), "r:gz") as archive:
        entries = archive.getmembers()
        files = {}
        for entry in entries:
            if not entry.isfile() or entry.name in files or not re.fullmatch(r"manifest\.json|data/derivatives/regenerate/[a-f0-9]{64}|releases/rel-[a-zA-Z0-9-]+/(?:archive|manifest)\.json", entry.name) or entry.size > 64 * 1024 * 1024:
                raise ValueError("Unsafe historical archive member")
            files[entry.name] = entry
        if len(files) > 10001 or sum(entry.size for entry in entries) > 256 * 1024 * 1024 or "manifest.json" not in files:
            raise ValueError("Historical bundle exceeds limits")
        manifest = json.load(archive.extractfile(files["manifest.json"]))
        if manifest.get("format") != "war-archive-historical-files" or manifest.get("version") != 1:
            raise ValueError("Invalid historical manifest")
        expected_files = {entry["path"]: entry for entry in manifest["files"]}
        if len(expected_files) != len(manifest["files"]) or set(files) != set(expected_files) | {"manifest.json"}:
            raise ValueError("Historical manifest inventory mismatch")
        contents = {}
        for name, entry in files.items():
            content = archive.extractfile(entry).read()
            if name != "manifest.json" and (hashlib.sha256(content).hexdigest() != expected_files[name]["sha256"] or len(content) != expected_files[name]["sizeBytes"]):
                raise ValueError("Historical member checksum mismatch")
            contents[name] = content
    destination.mkdir(mode=0o755)
    destination.chmod(0o755)
    for name, content in contents.items():
        path = destination / name
        path.parent.mkdir(parents=True, exist_ok=True)
        for parent in path.parents:
            if parent == destination:
                break
            parent.chmod(0o755)
        with path.open("xb") as stream:
            stream.write(content)
        path.chmod(0o644)


def main():
    import fcntl
    def interrupted(_signum, _frame):
        raise InterruptedError("Historical installer interrupted")
    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", required=True)
    parser.add_argument("--bundle", required=True)
    parser.add_argument("--sha256", required=True)
    parser.add_argument("--installer-sha256", required=True)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    root = Path(args.root).resolve(strict=True)
    bundle = Path(args.bundle).resolve(strict=True)
    if root == Path("/") or root not in bundle.parents or bundle.is_symlink() or not bundle.is_file():
        raise ValueError("A bundle inside the dedicated deployment root is required")
    installer = root / "deployment/install-historical-files.mjs"
    content = installer.read_bytes()
    if hashlib.sha256(content).hexdigest() != args.installer_sha256:
        raise ValueError("Historical installer checksum mismatch")
    with (root / "state/update.flock").open("a") as lock:
        until = time.monotonic() + 600
        while True:
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except BlockingIOError:
                if time.monotonic() >= until:
                    raise TimeoutError("Deployment lock unavailable")
                time.sleep(1)
        commit = (root / "state/current-commit").read_text().strip()
        if not re.fullmatch(r"[a-f0-9]{40}", commit):
            raise ValueError("Invalid current deployment commit")
        stage = root / "artifacts" / ("historical-repair-" + uuid.uuid4().hex)
        extract_verified(bundle, args.sha256, stage)
        (stage / "install-historical-files.mjs").write_bytes(content)
        (stage / "install-historical-files.mjs").chmod(0o644)
        docker = ([] if os.getuid() == 0 else ["sudo", "-n"]) + ["/usr/local/bin/docker"]
        options = [
            "--pull", "never", "--no-healthcheck", "--network", "none", "--read-only", "--cap-drop", "ALL",
            "--security-opt", "no-new-privileges:true", "--user", "1000:1000",
            "--mount", "type=volume,src=war-archive-data,dst=/var/lib/war-archive",
            "--mount", "type=volume,src=war-archive-releases,dst=/var/lib/war-archive-releases",
            "--mount", "type=bind,src=%s,dst=/repair,readonly" % stage,
            "--entrypoint", "node", "war-archive-backend:" + commit, "/repair/install-historical-files.mjs",
        ] + (["--apply"] if args.apply else [])
        run_container(docker, options, "war-archive-history-" + uuid.uuid4().hex)


if __name__ == "__main__":
    main()
