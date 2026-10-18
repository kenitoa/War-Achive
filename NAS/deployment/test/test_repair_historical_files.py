import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest

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


if __name__ == "__main__":
    unittest.main()
