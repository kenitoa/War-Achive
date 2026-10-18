#!/usr/bin/env python3
"""Restore a deployment backup into fresh, isolated Docker resources only.

No production environment, volumes, host ports, secrets or workers are used.
The generated project has an internal-only network; cleanup only addresses
resources created by this invocation after a collision check.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import sys
import tarfile
import time
from datetime import datetime, timezone

FILES = ("database.dump", "archive-files.tar", "releases.tar")
LABEL = "org.war-archive.restore-rehearsal"


def verify_backup(backup):
    backup = Path(backup).resolve(strict=True)
    expected = {}
    for line in (backup / "SHA256SUMS").read_text().splitlines():
        match = re.fullmatch(r"([0-9a-f]{64}) [ *](database\.dump|archive-files\.tar|releases\.tar)", line)
        if not match or match[2] in expected:
            raise ValueError("Invalid or duplicate backup checksum entry")
        expected[match[2]] = match[1]
    if set(expected) != set(FILES):
        raise ValueError("All three deployment backup checksums are required")
    for name in FILES:
        path = backup / name
        if path.is_symlink() or not path.is_file():
            raise ValueError("Backup members must be ordinary files")
        digest = hashlib.sha256()
        with path.open("rb") as stream:
            for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                digest.update(chunk)
        if digest.hexdigest() != expected[name]:
            raise ValueError("Backup checksum mismatch: " + name)
    for name in ("archive-files.tar", "releases.tar"):
        with tarfile.open(str(backup / name), "r:") as archive:
            for entry in archive:
                parts = entry.name.split("/")
                if entry.name.startswith("/") or ".." in parts or "\\" in entry.name:
                    raise ValueError("Unsafe backup archive path")
                if not (entry.isfile() or entry.isdir()):
                    raise ValueError("Links and special files are forbidden in backup archives")
    return expected


def isolated_compose(project, commit, password, token):
    if not re.fullmatch(r"war-archive-restore-[0-9]{8}t[0-9]{6}z-[0-9a-f]{12}", project):
        raise ValueError("A fresh rehearsal-specific project name is required")
    if not re.fullmatch(r"[0-9a-f]{40}", commit):
        raise ValueError("A pinned backend image commit is required")
    labels = {LABEL: project}
    return {
        "name": project,
        "services": {
            "db": {
                "image": "postgres:17-alpine", "pull_policy": "never",
                "environment": {"POSTGRES_USER": "archive", "POSTGRES_DB": "archive", "POSTGRES_PASSWORD": password},
                "volumes": ["database:/var/lib/postgresql/data"], "networks": ["isolated"], "labels": labels,
                # The entrypoint's temporary init server accepts Unix sockets only.
                # TCP prevents mistaking it for the final server just before shutdown.
                "healthcheck": {"test": ["CMD-SHELL", "pg_isready -h 127.0.0.1 -U archive -d archive"], "interval": "2s", "timeout": "3s", "retries": 45},
            },
            "api": {
                "image": "war-archive-backend:" + commit, "pull_policy": "never", "init": True,
                "environment": {
                    "NODE_ENV": "production", "HOST": "0.0.0.0", "ADMIN_PORT": "4310",
                    "DATABASE_URL": "postgresql://archive:" + password + "@db:5432/archive",
                    "WAR_ARCHIVE_ADMIN_TOKEN": token,
                    "DATA_DIR": "/var/lib/war-archive", "EXPORT_DIR": "/var/lib/war-archive-releases",
                    "LOCAL_WORKER_ENABLED": "false", "AUTO_PUBLISH_ENABLED": "false", "REMOTE_PUBLISH_ENABLED": "false",
                    "PUBLIC_ACCOUNT_API_ENABLED": "false", "ALLOWED_ORIGINS": "http://localhost:4310",
                },
                "volumes": ["data:/var/lib/war-archive", "releases:/var/lib/war-archive-releases"],
                "networks": ["isolated"], "labels": labels,
                "security_opt": ["no-new-privileges:true"], "cap_drop": ["ALL"],
            },
        },
        "volumes": {name: {"name": project + "-" + name, "labels": labels} for name in ("database", "data", "releases")},
        "networks": {"isolated": {"name": project + "-isolated", "internal": True, "labels": labels}},
    }


class Rehearsal:
    def __init__(self, docker, root, project, compose):
        self.docker = (["sudo", "-n"] if os.name == "posix" and os.getuid() else []) + [docker]
        self.root, self.project, self.compose = root, project, compose
        self.config = root / "compose.restore.json"
        self.created = False

    def call(self, args, source=None, timeout=120):
        streams = {"stdin": source} if hasattr(source, "read") else {"input": source}
        result = subprocess.run(self.docker + args, **streams, stdout=subprocess.PIPE,
                                stderr=subprocess.PIPE, timeout=timeout, check=False)
        if result.returncode:
            # Docker diagnostics may include configuration values; retain them only in private artifacts.
            with (self.root / "private-docker-errors.log").open("ab") as stream:
                stream.write(("Docker exit code: " + str(result.returncode) + "\n").encode())
                stream.write(result.stderr)
                stream.write(result.stdout)
            raise RuntimeError("Docker operation failed; inspect the private rehearsal log")
        return result.stdout

    def dc(self, args, source=None, timeout=120):
        return self.call(["compose", "--project-name", self.project, "-f", str(self.config)] + args, source, timeout)

    def prepare(self):
        for kind, names in (("container", [self.project + "-db-1", self.project + "-api-1"]),
                            ("volume", [v["name"] for v in self.compose["volumes"].values()]),
                            ("network", [self.project + "-isolated"])):
            known = self.call([kind, "ls"] + (["--all"] if kind == "container" else []) + ["--format", "{{.Name}}" if kind != "container" else "{{.Names}}"])
            if set(names) & set(known.decode().splitlines()):
                raise ValueError("Refusing an existing rehearsal resource")
        for service in self.compose["services"].values():
            self.call(["image", "inspect", service["image"]])
        self.config.write_text(json.dumps(self.compose))
        os.chmod(str(self.config), 0o600)
        self.dc(["config", "--quiet"])
        self.created = True

    def wait_db(self):
        for _ in range(60):
            container = self.dc(["ps", "-q", "db"]).decode().strip()
            health = self.call(["inspect", "--format", "{{.State.Health.Status}}", container]).decode().strip()
            if health == "healthy":
                return
            time.sleep(2)
        raise RuntimeError("Isolated database did not become healthy")

    def cleanup(self):
        if self.created:
            # Only the collision-checked unique project and its labelled, nonexternal resources.
            self.dc(["down", "--volumes", "--remove-orphans", "--timeout", "15"])
            for kind in ("container", "volume", "network"):
                names = self.call([kind, "ls"] + (["--all"] if kind == "container" else []) + ["--filter", "label=" + LABEL + "=" + self.project, "--format", "{{.Name}}" if kind != "container" else "{{.Names}}"])
                if names.strip():
                    raise RuntimeError("Isolated rehearsal resources remain after cleanup")
            self.created = False


def run(args):
    backup = Path(args.backup).resolve(strict=True)
    expected = verify_backup(backup)
    project = "war-archive-restore-" + datetime.now(timezone.utc).strftime("%Y%m%dt%H%M%Sz") + "-" + secrets.token_hex(6)
    artifacts = Path(args.artifacts).resolve()
    artifacts.mkdir(parents=True, exist_ok=True, mode=0o700)
    root = artifacts / project
    root.mkdir(mode=0o700)
    password, token = secrets.token_hex(32), secrets.token_urlsafe(32)
    compose = isolated_compose(project, args.image_commit, password, token)
    job = Rehearsal(args.docker, root, project, compose)
    result = {"operation": "archive.restore-rehearsal", "project": project, "backup": backup.name,
              "imageCommit": args.image_commit, "backupSha256": expected, "startedAt": datetime.now(timezone.utc).isoformat()}
    try:
        result["stage"] = "prepare"
        job.prepare()
        job.dc(["up", "-d", "--no-build", "db"])
        job.wait_db()
        result["stage"] = "database-restore"
        with (backup / "database.dump").open("rb") as source:
            job.dc(["exec", "-T", "db", "pg_restore", "-U", "archive", "-d", "archive", "--no-owner", "--no-acl", "--exit-on-error"], source, timeout=1800)
        for name, destination in (("archive-files.tar", "/var/lib/war-archive"), ("releases.tar", "/var/lib/war-archive-releases")):
            result["stage"] = name
            with (backup / name).open("rb") as source:
                job.dc(["run", "--rm", "--no-deps", "-T", "--entrypoint", "tar", "api", "-C", destination, "-xf", "-"], source, timeout=1800)
        preserved_tables = ["schema_migrations", "records", "record_versions", "raw_items", "media_assets", "productions", "publications", "members", "member_shelves"]
        baseline_sql = "SELECT json_build_object(" + ",".join("'" + table + "',(SELECT count(*) FROM " + table + ")" for table in preserved_tables) + ");"
        result["restoredCountsBeforeRecovery"] = json.loads(job.dc(["exec", "-T", "db", "psql", "-tA", "-v", "ON_ERROR_STOP=1", "-U", "archive", "-d", "archive"], baseline_sql.encode()).decode().strip())
        recovery_sql = b"BEGIN; DELETE FROM member_sessions; DELETE FROM member_reset_tokens; UPDATE jobs SET state='queued',owner=null,lease_until=null,attempts=0,run_at=now(),last_error='RESTORE_REQUEUED',updated_at=now() WHERE state='running'; COMMIT;"
        result["stage"] = "isolated-recovery"
        job.dc(["exec", "-T", "db", "psql", "-v", "ON_ERROR_STOP=1", "-U", "archive", "-d", "archive"], recovery_sql)
        job.dc(["up", "-d", "--no-build", "api"])
        result["stage"] = "runtime-isolation"
        internal = job.call(["network", "inspect", "--format", "{{.Internal}}", project + "-isolated"]).decode().strip()
        if internal != "true":
            raise RuntimeError("Rehearsal network must be internal")
        for service in ("db", "api"):
            container = job.dc(["ps", "-q", service]).decode().strip()
            bindings = json.loads(job.call(["inspect", "--format", "{{json .HostConfig.PortBindings}}", container]).decode())
            if bindings:
                raise RuntimeError("Rehearsal must not publish host ports")
            mounts = json.loads(job.call(["inspect", "--format", "{{json .Mounts}}", container]).decode())
            permitted_volumes = {value["name"] for value in compose["volumes"].values()}
            if any(mount.get("Type") != "volume" or mount.get("Name") not in permitted_volumes for mount in mounts):
                raise RuntimeError("Rehearsal must use only its own dedicated volumes")
        result["runtimeIsolationVerified"] = True
        verification = Path(__file__).with_name("verify-restored-archive.mjs").read_bytes()
        result["stage"] = "verification"
        proof = job.dc(["exec", "-T", "api", "node", "--input-type=module"], verification, timeout=1800)
        result["verification"] = json.loads(proof.decode().strip())
        if result["verification"].get("status") != "passed":
            raise RuntimeError("Restored archive verification did not pass")
        if any(result["verification"]["counts"].get(table) != count for table, count in result["restoredCountsBeforeRecovery"].items()):
            raise RuntimeError("Restored record counts changed during recovery verification")
        result["preservedCountsMatch"] = True
        result["stage"] = "complete"
        result["status"] = "passed"
    except Exception as error:
        result["status"], result["error"] = "failed", type(error).__name__ + ": " + str(error)
    finally:
        try:
            job.cleanup()
            result["isolatedResourcesRemoved"] = True
        except Exception:
            result["isolatedResourcesRemoved"] = False
            result["status"] = "failed"
        # The isolated credentials are no longer needed; no production secret was loaded.
        if result["isolatedResourcesRemoved"] and job.config.exists():
            job.config.unlink()
        result["completedAt"] = datetime.now(timezone.utc).isoformat()
        (root / "result.json").write_text(json.dumps(result, indent=2) + "\n")
        print(json.dumps(result))
    return 0 if result["status"] == "passed" else 1


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--backup", required=True)
    parser.add_argument("--image-commit", required=True)
    parser.add_argument("--artifacts", required=True)
    parser.add_argument("--docker", default="/usr/local/bin/docker")
    sys.exit(run(parser.parse_args()))
