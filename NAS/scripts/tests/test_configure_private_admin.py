import contextlib
import copy
import importlib.util
import io
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch


SCRIPT = Path(__file__).resolve().parents[1] / "configure-private-admin.py"
SPEC = importlib.util.spec_from_file_location("archive_configure_private_admin", SCRIPT)
admin = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = admin
SPEC.loader.exec_module(admin)
HOST = "archive-fixture.example.ts.net"
TARGET = HOST + ":8446"
PUBLIC_TARGET = HOST + ":443"


def initial_config():
    return {
        "TCP": {"443": {"HTTPS": True}, "8443": {"HTTPS": True}, "10000": {"TCPForward": "127.0.0.1:9999"}},
        "Web": {
            PUBLIC_TARGET: {"Handlers": {
                "/": {"Proxy": "http://127.0.0.1:8100"},
                "/war-archive-api": {"Proxy": "http://127.0.0.1:9232"},
            }},
            "other.example.ts.net:8443": {"Handlers": {"/": {"Text": "preserve"}}},
        },
        "AllowFunnel": {PUBLIC_TARGET: True, "other.example.ts.net:8443": True},
        "Foreground": {"unrelated": {"TCP": {"9443": {"HTTPS": True}}}},
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
        return admin.funnel.Snapshot(copy.deepcopy(self.config), '"etag-%s"' % self.version)

    def write_config(self, config, etag):
        self.writes.append((copy.deepcopy(config), etag))
        status = self.statuses.pop(0) if self.statuses else 200
        if status in (409, 412):
            self.version += 1
            self.config["Web"][PUBLIC_TARGET]["Handlers"]["/concurrent-%s" % self.version] = {"Text": "preserve"}
            raise admin.funnel.ConfigurationConflict("CAS_CONFLICT", "conflict", status)
        if status == 403:
            raise admin.funnel.FunnelError("LOCAL_API_FORBIDDEN", "Denied; no bypass attempted.", status)
        if etag != '"etag-%s"' % self.version:
            raise AssertionError("Caller submitted an outdated Etag.")
        self.config = copy.deepcopy(config)
        self.version += 1
        if self.after_write:
            self.after_write(self.config)


class PrivateConfigurationTests(unittest.TestCase):
    def test_default_dry_run_adds_only_the_private_tcp_and_web_keys_without_writing(self):
        original = initial_config()
        client = MemoryClient(original)
        result = admin.configure(client, HOST)
        self.assertEqual(result["status"], "planned")
        self.assertEqual(result["access"], "tailnet-only")
        self.assertFalse(result["funnelEnabled"])
        self.assertEqual(client.config, original)
        self.assertEqual(client.writes, [])
        candidate, changed = admin.planned_config(original, TARGET)
        self.assertTrue(changed)
        self.assertEqual(candidate["TCP"].pop("8446"), {"HTTPS": True})
        self.assertEqual(candidate["Web"].pop(TARGET), {"Handlers": {"/": {"Proxy": "http://127.0.0.1:9231"}}})
        self.assertEqual(candidate, original)
        self.assertEqual(original, initial_config())

    def test_apply_verifies_preservation_of_existing_public_and_private_services(self):
        client = MemoryClient()
        result = admin.configure(client, HOST, apply=True)
        self.assertEqual(result["status"], "applied")
        self.assertEqual(client.reads, 2)
        self.assertEqual(len(client.writes), 1)
        self.assertEqual(client.writes[0][1], '"etag-1"')
        self.assertTrue(result["priorConfigurationPreserved"])
        self.assertNotEqual(result["beforeSha256"], result["afterSha256"])
        self.assertNotIn(TARGET, client.config["AllowFunnel"])
        self.assertNotIn("8100", json.dumps(result))

    def test_idempotent_exact_configuration_does_not_write(self):
        configured, _ = admin.planned_config(initial_config(), TARGET)
        client = MemoryClient(configured)
        result = admin.configure(client, HOST, apply=True)
        self.assertEqual(result["status"], "already-configured")
        self.assertFalse(result["changed"])
        self.assertEqual(client.writes, [])
        self.assertEqual(client.reads, 2)

    def test_cas_conflicts_reread_and_preserve_concurrent_changes(self):
        client = MemoryClient(statuses=[409, 412, 200])
        result = admin.configure(client, HOST, apply=True)
        self.assertEqual(result["attempts"], 3)
        self.assertEqual(client.reads, 4)
        self.assertEqual([entry[1] for entry in client.writes], ['"etag-1"', '"etag-2"', '"etag-3"'])
        self.assertIn("/concurrent-2", client.config["Web"][PUBLIC_TARGET]["Handlers"])
        self.assertIn("/concurrent-3", client.config["Web"][PUBLIC_TARGET]["Handlers"])

    def test_cas_exhaustion_does_not_write_without_if_match(self):
        client = MemoryClient(statuses=[412, 412, 412])
        with self.assertRaises(admin.funnel.FunnelError) as raised:
            admin.configure(client, HOST, apply=True)
        self.assertEqual(raised.exception.code, "CAS_RETRY_EXHAUSTED")
        self.assertEqual(len(client.writes), 3)
        self.assertNotIn("8446", client.config["TCP"])

    def test_forbidden_write_stops_without_retry_or_fallback(self):
        client = MemoryClient(statuses=[403])
        with self.assertRaises(admin.funnel.FunnelError) as raised:
            admin.configure(client, HOST, apply=True)
        self.assertEqual(raised.exception.code, "LOCAL_API_FORBIDDEN")
        self.assertEqual(client.reads, 1)
        self.assertEqual(len(client.writes), 1)

    def test_public_port_foreground_and_existing_server_conflicts_fail_closed(self):
        cases = []
        for target in [TARGET, "other.example.ts.net:8446"]:
            public = initial_config()
            public["AllowFunnel"][target] = True
            cases.append((public, "FUNNEL_CONFLICT"))
        tcp = initial_config()
        tcp["TCP"]["8446"] = {"TCPForward": "127.0.0.1:9999"}
        cases.append((tcp, "ADMIN_PORT_OCCUPIED"))
        partial = initial_config()
        partial["TCP"]["8446"] = {"HTTPS": True}
        cases.append((partial, "ADMIN_PORT_OCCUPIED"))
        web = initial_config()
        web["Web"][TARGET] = {"Handlers": {"/": {"Proxy": "http://127.0.0.1:9999"}}}
        cases.append((web, "ADMIN_PORT_OCCUPIED"))
        other_web = initial_config()
        other_web["Web"]["other.example.ts.net:8446"] = copy.deepcopy(admin.EXPECTED_SERVER)
        cases.append((other_web, "WEB_PORT_OCCUPIED"))
        extra, _ = admin.planned_config(initial_config(), TARGET)
        extra["Web"][TARGET]["Handlers"]["/other"] = {"Text": "preserve"}
        cases.append((extra, "ADMIN_PORT_OCCUPIED"))
        for kind, value in [("TCP", {"8446": {"HTTPS": True}}), ("Web", {TARGET: copy.deepcopy(admin.EXPECTED_SERVER)})]:
            foreground = initial_config()
            foreground["Foreground"]["occupied"] = {kind: value}
            cases.append((foreground, "FOREGROUND_CONFLICT"))
        public_foreground = initial_config()
        public_foreground["Foreground"]["occupied"] = {"AllowFunnel": {TARGET: True}}
        cases.append((public_foreground, "FUNNEL_CONFLICT"))
        for configuration, code in cases:
            with self.subTest(code=code, configuration=configuration):
                client = MemoryClient(configuration)
                with self.assertRaises(admin.funnel.FunnelError) as raised:
                    admin.configure(client, HOST, apply=True)
                self.assertEqual(raised.exception.code, code)
                self.assertEqual(client.writes, [])

    def test_private_false_permission_is_preserved_and_new_empty_maps_are_supported(self):
        original = {"AllowFunnel": {TARGET: False}}
        client = MemoryClient(original)
        self.assertEqual(admin.configure(client, HOST, apply=True)["status"], "applied")
        self.assertIs(client.config["AllowFunnel"][TARGET], False)

    def test_post_write_drift_reports_failure_without_overwriting_other_services(self):
        def drift(configuration):
            configuration["Web"][PUBLIC_TARGET]["Handlers"]["/"] = {"Proxy": "http://127.0.0.1:9999"}
        client = MemoryClient(after_write=drift)
        with self.assertRaises(admin.funnel.FunnelError) as raised:
            admin.configure(client, HOST, apply=True)
        self.assertEqual(raised.exception.code, "VERIFY_PRESERVATION_FAILED")
        self.assertEqual(len(client.writes), 1)

    def test_post_write_public_permission_is_detected_without_overwriting_it(self):
        def expose(configuration):
            configuration["AllowFunnel"][TARGET] = True
        client = MemoryClient(after_write=expose)
        with self.assertRaises(admin.funnel.FunnelError) as raised:
            admin.configure(client, HOST, apply=True)
        self.assertEqual(raised.exception.code, "FUNNEL_CONFLICT")
        self.assertEqual(len(client.writes), 1)

    def test_invalid_host_maps_retry_counts_and_timeout_fail_closed(self):
        for host in ["https://archive.example.ts.net", "archive.example.ts.net:8446", "UPPER.example.ts.net", "example.invalid"]:
            with self.assertRaises(admin.funnel.FunnelError):
                admin.configure(MemoryClient(), host)
        for key in ["TCP", "Web", "AllowFunnel", "Foreground"]:
            malformed = initial_config()
            malformed[key] = []
            with self.assertRaises(admin.funnel.FunnelError) as raised:
                admin.configure(MemoryClient(malformed), HOST)
            self.assertEqual(raised.exception.code, "INVALID_CONFIG")
        with self.assertRaises(admin.funnel.FunnelError):
            admin.configure(MemoryClient(), HOST, max_attempts=0)
        with contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(admin.main(["--host", HOST, "--timeout", "0"]), 1)


class Response:
    def __init__(self, status=200, etag='"daemon-etag"', body=None):
        self.status = status
        self.etag = etag
        self.body = json.dumps(initial_config()).encode() if body is None else body

    def read(self, limit):
        return self.body[:limit]

    def getheader(self, name):
        return self.etag if name.lower() == "etag" else None


class Connection:
    def __init__(self, response):
        self.response = response
        self.requests = []

    def request(self, method, path, body=None, headers=None):
        self.requests.append((method, path, body, headers))

    def getresponse(self):
        return self.response

    def close(self):
        pass


class SharedTransportTests(unittest.TestCase):
    def test_missing_etag_stops_before_any_post(self):
        connection = Connection(Response(etag=None))
        with patch.object(admin.funnel, "UnixHTTPConnection", return_value=connection):
            with self.assertRaises(admin.funnel.FunnelError) as raised:
                admin.configure(admin.funnel.LocalAPI("/fixture/tailscaled.sock"), HOST, apply=True)
        self.assertEqual(raised.exception.code, "MISSING_ETAG")
        self.assertEqual([request[0] for request in connection.requests], ["GET"])

    def test_forbidden_cli_reports_status_without_response_body_or_fallback(self):
        connection = Connection(Response(status=403, body=b"private-secret-body"))
        stderr = io.StringIO()
        with patch.object(admin.funnel, "UnixHTTPConnection", return_value=connection):
            with contextlib.redirect_stderr(stderr), contextlib.redirect_stdout(io.StringIO()):
                status = admin.main(["--host", HOST, "--socket", "/fixture/tailscaled.sock", "--apply"])
        self.assertEqual(status, 3)
        self.assertEqual(json.loads(stderr.getvalue())["error"]["httpStatus"], 403)
        self.assertNotIn("private-secret-body", stderr.getvalue())
        self.assertEqual(len(connection.requests), 1)


if __name__ == "__main__":
    unittest.main()
