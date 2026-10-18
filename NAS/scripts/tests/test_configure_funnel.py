import contextlib
import copy
import importlib.util
import io
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch


SCRIPT = Path(__file__).resolve().parents[1] / "configure-funnel.py"
SPEC = importlib.util.spec_from_file_location("archive_configure_funnel", SCRIPT)
funnel = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = funnel
SPEC.loader.exec_module(funnel)
HOST = "archive-fixture.example.ts.net"
TARGET = HOST + ":443"


def initial_config():
    return {
        "TCP": {"443": {"HTTPS": True}, "8443": {"HTTPS": True}},
        "Web": {
            TARGET: {"Handlers": {
                "/": {"Proxy": "http://127.0.0.1:8100"},
                "/stockpilot": {"Proxy": "http://127.0.0.1:8200"},
                "/notion": {"Proxy": "http://127.0.0.1:8300"},
            }},
            "other.example.ts.net:8443": {"Handlers": {"/": {"Text": "unchanged"}}},
        },
        "AllowFunnel": {TARGET: True, "other.example.ts.net:8443": True},
    }


class MemoryClient:
    def __init__(self, config=None, statuses=None, after_write=None):
        self.config = copy.deepcopy(config if config is not None else initial_config())
        self.version = 1
        self.statuses = list(statuses or [])
        self.after_write = after_write
        self.reads = 0
        self.writes = []

    def read_config(self):
        self.reads += 1
        return funnel.Snapshot(copy.deepcopy(self.config), '"etag-%s"' % self.version)

    def write_config(self, config, etag):
        self.writes.append((copy.deepcopy(config), etag))
        status = self.statuses.pop(0) if self.statuses else 200
        if status in (409, 412):
            self.version += 1
            self.config["Web"][TARGET]["Handlers"]["/concurrent-%s" % self.version] = {"Text": "concurrent writer"}
            raise funnel.ConfigurationConflict("CAS_CONFLICT", "conflict", status)
        if status == 403:
            raise funnel.FunnelError("LOCAL_API_FORBIDDEN", "Denied; no bypass attempted.", status)
        if etag != '"etag-%s"' % self.version:
            raise AssertionError("Caller submitted an outdated Etag.")
        self.config = copy.deepcopy(config)
        self.version += 1
        if self.after_write:
            self.after_write(self.config)


class ConfigurationTests(unittest.TestCase):
    def test_dry_run_changes_only_new_handler_and_does_not_write(self):
        original = initial_config()
        client = MemoryClient(original)
        result = funnel.configure(client, HOST)
        self.assertEqual(result["status"], "planned")
        self.assertTrue(result["changed"])
        self.assertEqual(client.config, original)
        self.assertEqual(client.writes, [])
        candidate, changed = funnel.planned_config(original, TARGET)
        self.assertTrue(changed)
        self.assertEqual(candidate["Web"][TARGET]["Handlers"].pop(funnel.MOUNT), {"Proxy": funnel.PROXY})
        self.assertEqual(candidate, original)
        self.assertEqual(original, initial_config())

    def test_apply_rereads_and_proves_all_existing_configuration_preserved(self):
        client = MemoryClient()
        result = funnel.configure(client, HOST, apply=True)
        self.assertEqual(result["status"], "applied")
        self.assertEqual(client.reads, 2)
        self.assertEqual(len(client.writes), 1)
        self.assertEqual(client.writes[0][1], '"etag-1"')
        self.assertTrue(result["priorConfigurationPreserved"])
        self.assertNotEqual(result["beforeSha256"], result["afterSha256"])
        self.assertNotIn("stockpilot", json.dumps(result))
        self.assertNotIn("8100", json.dumps(result))

    def test_idempotent_apply_does_not_post_or_modify_configuration(self):
        configured, _ = funnel.planned_config(initial_config(), TARGET)
        client = MemoryClient(configured)
        result = funnel.configure(client, HOST, apply=True)
        self.assertFalse(result["changed"])
        self.assertEqual(result["status"], "already-configured")
        self.assertEqual(client.reads, 2)
        self.assertEqual(client.writes, [])
        self.assertEqual(result["beforeSha256"], result["afterSha256"])

    def test_409_and_412_reread_latest_config_and_preserve_concurrent_handlers(self):
        client = MemoryClient(statuses=[409, 412, 200])
        result = funnel.configure(client, HOST, apply=True)
        self.assertEqual(result["attempts"], 3)
        self.assertEqual(client.reads, 4)
        self.assertEqual([entry[1] for entry in client.writes], ['"etag-1"', '"etag-2"', '"etag-3"'])
        for prefix in ["/", "/stockpilot", "/notion", "/concurrent-2", "/concurrent-3", funnel.MOUNT]:
            self.assertIn(prefix, client.config["Web"][TARGET]["Handlers"])

    def test_repeated_conflict_stops_without_unguarded_fallback(self):
        client = MemoryClient(statuses=[412, 412, 412])
        with self.assertRaises(funnel.FunnelError) as raised:
            funnel.configure(client, HOST, apply=True)
        self.assertEqual(raised.exception.code, "CAS_RETRY_EXHAUSTED")
        self.assertEqual(len(client.writes), 3)
        self.assertNotIn(funnel.MOUNT, client.config["Web"][TARGET]["Handlers"])

    def test_forbidden_write_is_not_retried_or_bypassed(self):
        client = MemoryClient(statuses=[403])
        with self.assertRaises(funnel.FunnelError) as raised:
            funnel.configure(client, HOST, apply=True)
        self.assertEqual(raised.exception.code, "LOCAL_API_FORBIDDEN")
        self.assertEqual(raised.exception.status, 403)
        self.assertEqual(client.reads, 1)
        self.assertEqual(len(client.writes), 1)

    def test_preconditions_reject_network_enablement_shadowing_and_occupied_prefix(self):
        cases = []
        missing_funnel = initial_config()
        missing_funnel["AllowFunnel"][TARGET] = False
        cases.append((missing_funnel, "FUNNEL_NOT_ENABLED"))
        missing_https = initial_config()
        missing_https["TCP"]["443"] = {"HTTP": True}
        cases.append((missing_https, "HTTPS_NOT_ENABLED"))
        missing_server = initial_config()
        del missing_server["Web"][TARGET]
        cases.append((missing_server, "MISSING_PUBLIC_SERVER"))
        occupied = initial_config()
        occupied["Web"][TARGET]["Handlers"][funnel.MOUNT] = {"Proxy": "http://127.0.0.1:9999"}
        cases.append((occupied, "HANDLER_OCCUPIED"))
        occupied_child = initial_config()
        occupied_child["Web"][TARGET]["Handlers"][funnel.MOUNT + "/child"] = {"Text": "preserve"}
        cases.append((occupied_child, "HANDLER_OCCUPIED"))
        foreground = initial_config()
        foreground["Foreground"] = {"session-id": {"TCP": {"443": {"HTTPS": True}}}}
        cases.append((foreground, "FOREGROUND_CONFLICT"))
        for config, code in cases:
            with self.subTest(code=code):
                client = MemoryClient(config)
                with self.assertRaises(funnel.FunnelError) as raised:
                    funnel.configure(client, HOST, apply=True)
                self.assertEqual(raised.exception.code, code)
                self.assertEqual(client.writes, [])

    def test_post_write_verification_reports_drift_without_reverting_other_services(self):
        def drift(config):
            config["Web"][TARGET]["Handlers"]["/"] = {"Proxy": "http://127.0.0.1:9999"}
        client = MemoryClient(after_write=drift)
        with self.assertRaises(funnel.FunnelError) as raised:
            funnel.configure(client, HOST, apply=True)
        self.assertEqual(raised.exception.code, "VERIFY_PRESERVATION_FAILED")
        self.assertEqual(len(client.writes), 1)

    def test_benign_concurrent_additions_after_write_are_preserved(self):
        def addition(config):
            config["Web"][TARGET]["Handlers"]["/new-service"] = {"Text": "concurrent addition"}
        client = MemoryClient(after_write=addition)
        self.assertEqual(funnel.configure(client, HOST, apply=True)["status"], "applied")
        self.assertIn("/new-service", client.config["Web"][TARGET]["Handlers"])


class Response:
    def __init__(self, status=200, body=None, etag="daemon-etag"):
        self.status = status
        self.body = json.dumps(initial_config()).encode() if body is None else body
        self.etag = etag

    def read(self, limit):
        return self.body[:limit]

    def getheader(self, name):
        return self.etag if name.lower() == "etag" else None


class Connection:
    def __init__(self, response):
        self.response = response
        self.requests = []
        self.closed = False

    def request(self, method, path, body=None, headers=None):
        self.requests.append((method, path, body, headers))

    def getresponse(self):
        return self.response

    def close(self):
        self.closed = True


class LocalAPITransportTests(unittest.TestCase):
    def test_post_transmits_exact_if_match_without_etag_in_json(self):
        connection = Connection(Response(body=b""))
        with patch.object(funnel, "UnixHTTPConnection", return_value=connection):
            funnel.LocalAPI("/fixture/tailscaled.sock").write_config(initial_config(), '"daemon-etag"')
        method, path, body, headers = connection.requests[0]
        self.assertEqual(method, "POST")
        self.assertEqual(path, "/localapi/v0/serve-config")
        self.assertEqual(headers["If-Match"], '"daemon-etag"')
        self.assertEqual(json.loads(body), initial_config())
        self.assertNotIn("ETag", json.loads(body))
        self.assertTrue(connection.closed)

    def test_get_requires_etag_and_valid_unique_key_json(self):
        for response, code in [
            (Response(etag=None), "MISSING_ETAG"),
            (Response(body=b'{"Web": {}, "Web": {}}'), "INVALID_CONFIG"),
            (Response(body=b'{"bad": NaN}'), "INVALID_CONFIG"),
            (Response(body=b"null"), "MISSING_PUBLIC_SERVER"),
        ]:
            with self.subTest(code=code):
                with patch.object(funnel, "UnixHTTPConnection", return_value=Connection(response)):
                    with self.assertRaises(funnel.FunnelError) as raised:
                        funnel.LocalAPI("/fixture/tailscaled.sock").read_config()
                    self.assertEqual(raised.exception.code, code)

    def test_forbidden_body_is_not_exposed_and_cli_reports_status_without_fallback(self):
        connection = Connection(Response(status=403, body=b"secret-fixture-private-configuration"))
        stderr = io.StringIO()
        stdout = io.StringIO()
        with patch.object(funnel, "UnixHTTPConnection", return_value=connection):
            with contextlib.redirect_stderr(stderr), contextlib.redirect_stdout(stdout):
                status = funnel.main(["--host", HOST, "--socket", "/fixture/tailscaled.sock", "--apply"])
        self.assertEqual(status, 3)
        self.assertEqual(stdout.getvalue(), "")
        self.assertEqual(json.loads(stderr.getvalue())["error"]["httpStatus"], 403)
        self.assertNotIn("secret-fixture", stderr.getvalue())
        self.assertEqual(len(connection.requests), 1)


if __name__ == "__main__":
    unittest.main()
