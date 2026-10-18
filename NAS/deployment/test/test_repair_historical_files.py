import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location("repair_history", Path(__file__).resolve().parents[1] / "repair-historical-files.py")
repair = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(repair)


class ArchiveSafetyTests(unittest.TestCase):
    def test_exact_manifest_and_bytes_extract_without_overwrite(self):
        with tempfile.TemporaryDirectory() as root:
            root = Path(root)
            value = b"exact bytes"
            digest = hashlib.sha256(value).hexdigest()
            name = "data/derivatives/regenerate/" + digest
            manifest = {"format": "war-archive-historical-files", "version": 1, "files": [{"path": name, "sha256": digest, "sizeBytes": len(value)}]}
            bundle = root / "bundle.tar.gz"
            with tarfile.open(str(bundle), "w:gz") as tar:
                for path, body in [("manifest.json", json.dumps(manifest).encode()), (name, value)]:
                    entry = tarfile.TarInfo(path)
                    entry.size = len(body)
                    tar.addfile(entry, io.BytesIO(body))
            sha = hashlib.sha256(bundle.read_bytes()).hexdigest()
            repair.extract_verified(bundle, sha, root / "stage")
            self.assertEqual((root / "stage" / name).read_bytes(), value)
            with self.assertRaises(FileExistsError):
                repair.extract_verified(bundle, sha, root / "stage")

    def test_traversal_and_links_fail_before_extraction(self):
        for name, kind in [("../escape", tarfile.REGTYPE), ("/absolute", tarfile.REGTYPE), ("manifest.json", tarfile.SYMTYPE), ("manifest.json", tarfile.LNKTYPE), ("data\\escape", tarfile.REGTYPE)]:
            with self.subTest(name=name, kind=kind), tempfile.TemporaryDirectory() as root:
                root = Path(root)
                bundle = root / "bundle.tar.gz"
                with tarfile.open(str(bundle), "w:gz") as tar:
                    entry = tarfile.TarInfo(name)
                    entry.type = kind
                    tar.addfile(entry)
                with self.assertRaises(ValueError):
                    repair.extract_verified(bundle, hashlib.sha256(bundle.read_bytes()).hexdigest(), root / "stage")
                self.assertFalse((root / "stage").exists())

    def test_outer_checksum_mismatch_and_duplicate_members_fail_before_extraction(self):
        with tempfile.TemporaryDirectory() as root:
            root = Path(root)
            bundle = root / "bundle.tar.gz"
            with tarfile.open(str(bundle), "w:gz") as tar:
                for _ in range(2):
                    entry = tarfile.TarInfo("manifest.json")
                    tar.addfile(entry)
            for expected in ["0" * 64, hashlib.sha256(bundle.read_bytes()).hexdigest()]:
                with self.assertRaises(ValueError):
                    repair.extract_verified(bundle, expected, root / "stage")
            self.assertFalse((root / "stage").exists())


class ContainerLifecycleTests(unittest.TestCase):
    def execute(self, timeout=1800, wrong_label=False):
        calls = []
        self.calls = calls
        running = True
        reads = 0
        name = "war-archive-history-fixture"

        def run(command, **_options):
            nonlocal running, reads
            calls.append(command)
            output = ""
            if command[1] == "inspect":
                if ".Config.Labels" in command[3]:
                    output = "another-container" if wrong_label else name
                else:
                    reads += 1
                    if timeout and reads > 1:
                        running = False
                    output = json.dumps({"Running": running, "ExitCode": 0})
            elif command[1] == "stop":
                running = False
            return SimpleNamespace(stdout=output)

        with patch.object(repair.subprocess, "run", side_effect=run), patch.object(repair.time, "sleep"):
            repair.run_container(["docker"], ["--network", "none", "fixture-image"], name, timeout)
        return calls

    def test_named_labeled_container_is_removed_only_after_confirmed_completion(self):
        calls = self.execute()
        self.assertIn("--name", calls[0])
        self.assertIn(repair.LABEL + "=war-archive-history-fixture", calls[0])
        self.assertFalse(any(command[1] == "stop" for command in calls))
        self.assertEqual(calls[-1], ["docker", "rm", "war-archive-history-fixture"])
        self.assertFalse(any("-v" in command for command in calls))

    def test_timeout_stops_only_own_container_before_cleanup_returns(self):
        with self.assertRaises(TimeoutError):
            self.execute(timeout=0)
        commands = [command[1] for command in self.calls]
        self.assertLess(commands.index("stop"), commands.index("rm"))
        self.assertEqual(self.calls[commands.index("stop")], ["docker", "stop", "--time", "30", "war-archive-history-fixture"])
        self.assertEqual(self.calls[-1], ["docker", "rm", "war-archive-history-fixture"])

    def test_wrong_ownership_label_is_never_stopped_or_removed(self):
        with self.assertRaisesRegex(RuntimeError, "exact label"):
            self.execute(wrong_label=True)
        self.assertFalse(any(command[1] in ["stop", "rm"] for command in self.calls))


if __name__ == "__main__":
    unittest.main()
