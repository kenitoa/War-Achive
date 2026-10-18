import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest

SPEC = importlib.util.spec_from_file_location("restore_rehearsal", Path(__file__).parents[1] / "restore-rehearsal.py")
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def fixture(root, unsafe=None):
    (root / "database.dump").write_bytes(b"pgdump-fixture")
    for filename in ("archive-files.tar", "releases.tar"):
        with tarfile.open(str(root / filename), "w") as archive:
            entry = tarfile.TarInfo(unsafe or "./originals/hash.json")
            if unsafe == "link":
                entry.type, entry.linkname = tarfile.SYMTYPE, "/etc/passwd"
                archive.addfile(entry)
            else:
                entry.size = 2
                archive.addfile(entry, io.BytesIO(b"{}"))
    (root / "SHA256SUMS").write_text("".join(hashlib.sha256((root / name).read_bytes()).hexdigest() + "  " + name + "\n" for name in MODULE.FILES))


class RestoreRehearsalTests(unittest.TestCase):
    def test_isolation_has_no_ports_host_mounts_or_production_settings(self):
        project = "war-archive-restore-20261019t000000z-abcdef123456"
        compose = MODULE.isolated_compose(project, "a" * 40, "test-password", "test-token")
        self.assertEqual(set(compose["services"]), {"db", "api"})
        self.assertTrue(compose["networks"]["isolated"]["internal"])
        self.assertIn("-h 127.0.0.1", compose["services"]["db"]["healthcheck"]["test"][1])
        for service in compose["services"].values():
            self.assertNotIn("ports", service)
            self.assertNotIn("env_file", service)
            self.assertTrue(all(not mount.startswith("/") for mount in service["volumes"]))
            self.assertEqual(service["pull_policy"], "never")
        env = compose["services"]["api"]["environment"]
        self.assertEqual(env["REMOTE_PUBLISH_ENABLED"], "false")
        self.assertEqual(env["AUTO_PUBLISH_ENABLED"], "false")
        self.assertEqual(env["LOCAL_WORKER_ENABLED"], "false")
        self.assertNotIn("GITHUB_FRONT_SSH_KEY_PATH", env)
        self.assertNotIn("war-archive-postgres", json.dumps(compose))
        self.assertTrue(all(value["name"].startswith(project + "-") for value in compose["volumes"].values()))

    def test_existing_production_names_and_unpinned_images_rejected(self):
        for project, commit in (("war-archive", "a" * 40), ("war-archive-restore-20261019t000000z-abcdef123456", "latest")):
            with self.assertRaises(ValueError):
                MODULE.isolated_compose(project, commit, "pass", "token")

    def test_collision_is_refused_without_enabling_cleanup(self):
        project = "war-archive-restore-20261019t000000z-abcdef123456"
        with tempfile.TemporaryDirectory() as directory:
            job = MODULE.Rehearsal("docker", Path(directory), project, MODULE.isolated_compose(project, "a" * 40, "pass", "token"))
            job.call = lambda args: (project + "-db-1\n").encode()
            with self.assertRaisesRegex(ValueError, "existing rehearsal resource"):
                job.prepare()
            self.assertFalse(job.created)
            self.assertFalse(job.config.exists())

    def test_valid_backup_passes_all_three_checksums(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            fixture(root)
            self.assertEqual(set(MODULE.verify_backup(root)), set(MODULE.FILES))

    def test_corrupt_or_missing_backup_rejected_before_docker(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            fixture(root)
            (root / "database.dump").write_bytes(b"changed")
            with self.assertRaisesRegex(ValueError, "checksum mismatch"):
                MODULE.verify_backup(root)
            fixture(root)
            checksum = (root / "SHA256SUMS").read_text()
            (root / "SHA256SUMS").write_text(checksum + checksum.splitlines()[0] + "\n")
            with self.assertRaisesRegex(ValueError, "duplicate"):
                MODULE.verify_backup(root)

    def test_traversal_absolute_path_and_symlink_archives_rejected(self):
        for unsafe in ("../../escape", "/absolute", "dir\\escape", "link"):
            with tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                fixture(root, unsafe)
                with self.assertRaises(ValueError):
                    MODULE.verify_backup(root)


if __name__ == "__main__":
    unittest.main()
