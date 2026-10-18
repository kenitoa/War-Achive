import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest import mock
from uuid import uuid4

spec = importlib.util.spec_from_file_location("recovery_runtime", Path(__file__).resolve().parents[1] / "verify-recovery-runtime.py")
runtime = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runtime)


@unittest.skipIf(os.name == "nt", "POSIX permission guards run on the NAS Linux host")
class RecoveryRuntimeTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="war-recovery-test-")
        self.root = Path(self.temporary.name) / ("external-retrieval-" + str(uuid4())) / "restored"
        (self.root / "backup").mkdir(parents=True, mode=0o700)
        (self.root / "recovery").mkdir(mode=0o700)
        self.commit = "a" * 40
        self.tags = ["war-archive-backend:" + self.commit, "war-archive-gateway:" + self.commit, "postgres:17-alpine"]
        self.ids = {tag: "sha256:" + hashlib.sha256(json.dumps({"fixture": tag}).encode()).hexdigest() for tag in self.tags}
        for filename in ["database.dump", "archive-files.tar", "releases.tar", "database-contents.txt", "SHA256SUMS"]:
            (self.root / "backup" / filename).write_bytes(b"fixture-only")
        (self.root / "manifest.json").write_text(json.dumps({"version": 1, "scope": "war-archive-application", "commit": self.commit}))
        environment = self.root / "recovery/environment.env"
        environment.write_bytes(b"fixture-only-private-config\n" * 10)
        environment.chmod(0o600)
        self.write_secrets()
        self.write_source()
        self.write_images()
        self.write_identities()
        self.checksums()

    def tearDown(self):
        self.temporary.cleanup()

    def tar(self, filename, entries, compressed=False):
        with tarfile.open(self.root / "recovery" / filename, "w:gz" if compressed else "w:") as archive:
            for name, data, mode in entries:
                info = tarfile.TarInfo(name)
                info.size = len(data)
                info.mode = mode
                archive.addfile(info, io.BytesIO(data))

    def write_secrets(self, private_mode=0o600):
        self.tar("secrets.tar", [("github_deploy_key", b"fixture-private-key" * 10, private_mode), ("github_known_hosts", b"fixture-public-host" * 10, 0o644)])

    def write_source(self, unsafe=False):
        entries = [(f"releases/{self.commit}/{name}", b"fixture", 0o600) for name in ["Dockerfile", "compose.deploy.json", "release-source.json"]]
        entries += [("deployment/controller.mjs", b"fixture", 0o600), ("deployment/update.sh", b"fixture", 0o600), ("state/current.json", json.dumps({"commit": self.commit}).encode(), 0o600), ("state/current-commit", self.commit.encode(), 0o600)]
        if unsafe:
            entries.append(("../outside", b"unsafe-fixture", 0o600))
        self.tar("source-and-bootstrap.tar.gz", entries, True)

    def write_images(self, unexpected=False):
        entries = []
        saved = []
        for index, tag in enumerate(self.tags):
            data = json.dumps({"fixture": tag}).encode()
            config = hashlib.sha256(data).hexdigest() + ".json"
            entries.append((config, data, 0o600))
            saved.append({"Config": config, "RepoTags": ["unexpected/service:latest" if unexpected and index == 0 else tag], "Layers": []})
        entries.append(("manifest.json", json.dumps(saved).encode(), 0o600))
        self.tar("runtime-images.tar.gz", entries, True)

    def write_identities(self, wrong=False):
        (self.root / "recovery/image-identities.txt").write_text("\n".join(("sha256:" + "0" * 64 if wrong else self.ids[tag]) + " " + json.dumps([tag]) for tag in self.tags) + "\n")

    def checksums(self):
        files = ["manifest.json", "backup/database.dump", "backup/archive-files.tar", "backup/releases.tar", "backup/database-contents.txt", "backup/SHA256SUMS", "recovery/environment.env", "recovery/secrets.tar", "recovery/source-and-bootstrap.tar.gz", "recovery/runtime-images.tar.gz", "recovery/image-identities.txt"]
        (self.root / "SHA256SUMS").write_text("".join(hashlib.sha256((self.root / name).read_bytes()).hexdigest() + "  " + name + "\n" for name in files))

    def reject_without_loading(self, expected=ValueError):
        with mock.patch.object(runtime.subprocess, "run") as load:
            with self.assertRaises(expected):
                runtime.verify(str(self.root), True)
            load.assert_not_called()

    def test_valid_bundle_loads_only_matching_images_and_rechecks_identities(self):
        def inspect(args, **kwargs):
            return (self.ids[args[-1]] + "\n").encode()
        with mock.patch.object(runtime.subprocess, "check_output", side_effect=inspect) as inspect_call, mock.patch.object(runtime.subprocess, "run") as load:
            result = runtime.verify(str(self.root), True)
        self.assertEqual(result["runtimeImages"], 3)
        self.assertTrue(result["actualImageLoad"])
        self.assertEqual(inspect_call.call_count, 6)
        self.assertEqual(load.call_count, 1)
        self.assertIn("load", load.call_args.args[0])

    def test_wrong_commit_never_loads_an_image(self):
        value = json.loads((self.root / "manifest.json").read_text())
        value["commit"] = "b" * 40
        (self.root / "manifest.json").write_text(json.dumps(value))
        self.checksums()
        self.reject_without_loading()

    def test_missing_private_key_archive_never_loads_an_image(self):
        (self.root / "recovery/secrets.tar").unlink()
        self.reject_without_loading(FileNotFoundError)

    def test_public_private_environment_or_key_permissions_are_rejected(self):
        (self.root / "recovery/environment.env").chmod(0o644)
        self.reject_without_loading()
        (self.root / "recovery/environment.env").chmod(0o600)
        self.write_secrets(private_mode=0o644)
        self.checksums()
        self.reject_without_loading()

    def test_parent_traversal_in_source_archive_is_rejected(self):
        self.write_source(unsafe=True)
        self.checksums()
        self.reject_without_loading()

    def test_saved_image_identity_mismatch_never_loads_an_image(self):
        self.write_identities(wrong=True)
        self.checksums()
        self.reject_without_loading()

    def test_unexpected_image_tag_never_loads_an_image(self):
        self.write_images(unexpected=True)
        self.checksums()
        self.reject_without_loading()

    def test_changed_current_postgres_tag_never_loads_an_image(self):
        def inspect(args, **kwargs):
            return (("sha256:" + "f" * 64) if args[-1] == "postgres:17-alpine" else self.ids[args[-1]]).encode()
        with mock.patch.object(runtime.subprocess, "check_output", side_effect=inspect):
            self.reject_without_loading()

    def test_unverified_checksum_change_never_loads_an_image(self):
        (self.root / "backup/database.dump").write_bytes(b"modified fixture")
        self.reject_without_loading()


if __name__ == "__main__":
    unittest.main()
