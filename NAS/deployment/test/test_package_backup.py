import importlib.util
import os
from pathlib import Path
import subprocess
import tarfile
import tempfile
import unittest
from unittest import mock

spec = importlib.util.spec_from_file_location("backup_package", Path(__file__).resolve().parents[1] / "package-backup.py")
package_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(package_module)


class PackageBackupTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="war-package-test-")
        self.directory = Path(self.temporary.name)
        self.stage = self.directory / "stage"
        self.stage.mkdir()
        (self.stage / "backup").mkdir()
        (self.stage / "recovery").mkdir()
        (self.stage / "manifest.json").write_text('{"fixture":true}')
        (self.stage / "SHA256SUMS").write_text("fixture-only")

    def tearDown(self):
        self.temporary.cleanup()

    def test_real_large_tar_regression_packages_outside_without_input_mtime_changes(self):
        if os.name == "nt":
            self.skipTest("GNU tar directory-change regression is verified on the NAS")
        payload = os.urandom(16 * 1024 * 1024)
        (self.stage / "backup/input.bin").write_bytes(payload)
        before = self.stage.stat().st_mtime_ns
        output = self.directory / "complete.tar.gz"
        self.assertEqual(package_module.package(self.stage, output), output)
        self.assertEqual(self.stage.stat().st_mtime_ns, before)
        with tarfile.open(output, "r:gz") as archive:
            self.assertEqual(archive.extractfile("backup/input.bin").read(), payload)
            self.assertTrue({"manifest.json", "SHA256SUMS", "backup", "recovery"}.issubset(set(archive.getnames())))
        self.assertEqual(list(self.directory.glob("*.partial")), [])

    def test_refuses_output_inside_input_even_when_no_file_exists(self):
        with self.assertRaises(ValueError):
            package_module.package(self.stage, self.stage / "bundle.tar.gz")
        self.assertFalse((self.stage / "bundle.tar.gz").exists())

    def test_refuses_to_overwrite_a_previous_package(self):
        output = self.directory / "preserved.tar.gz"
        output.write_bytes(b"existing-backup")
        with self.assertRaises(FileExistsError):
            package_module.package(self.stage, output)
        self.assertEqual(output.read_bytes(), b"existing-backup")

    def test_failed_tar_never_creates_final_output_or_leaves_a_partial(self):
        (self.stage / "manifest.json").unlink()
        output = self.directory / "incomplete.tar.gz"
        with self.assertRaises(ValueError):
            package_module.package(self.stage, output)
        self.assertFalse(output.exists())
        self.assertEqual(list(self.directory.glob("*.partial")), [])

    def test_tar_failure_after_partial_writes_removes_only_its_temporary_output(self):
        output = self.directory / "failed.tar.gz"
        preserved = self.directory / "preserved.txt"
        preserved.write_bytes(b"keep-existing-file")
        def fail_after_write(arguments, **kwargs):
            Path(arguments[4]).write_bytes(b"partial-compressed-output")
            raise subprocess.CalledProcessError(1, arguments)
        with mock.patch.object(package_module.subprocess, "run", side_effect=fail_after_write):
            with self.assertRaises(subprocess.CalledProcessError):
                package_module.package(self.stage, output)
        self.assertFalse(output.exists())
        self.assertEqual(list(self.directory.glob("*.partial")), [])
        self.assertEqual(preserved.read_bytes(), b"keep-existing-file")


if __name__ == "__main__":
    unittest.main()
