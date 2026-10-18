#!/usr/bin/env python3
"""Add the archive admin as a private Tailscale HTTPS server on port 8446.

The existing Unix-socket LocalAPI transport performs Etag/If-Match compare and
swap. No Funnel permission, ACL, existing server, or operating-system permission
is modified. Conflicting configuration fails closed. Dry run is the default;
--apply explicitly enables the guarded POST.
"""

import argparse
import copy
import importlib.util
import json
from pathlib import Path
import sys


_SPEC = importlib.util.spec_from_file_location(
    "archive_private_admin_funnel_transport",
    Path(__file__).resolve().with_name("configure-funnel.py"),
)
funnel = importlib.util.module_from_spec(_SPEC)
sys.modules[_SPEC.name] = funnel
_SPEC.loader.exec_module(funnel)

PORT = "8446"
MOUNT = "/"
PROXY = "http://127.0.0.1:9231"
EXPECTED_TCP = {"HTTPS": True}
EXPECTED_SERVER = {"Handlers": {MOUNT: {"Proxy": PROXY}}}


def host_port(host):
    # Reuse the existing lowercase ts.net hostname validation.
    validated = funnel.host_port(host)
    return validated[:-len(":443")] + ":" + PORT


def _map(config, key):
    value = config.get(key, {})
    if not isinstance(value, dict):
        raise funnel.FunnelError("INVALID_CONFIG", "Serve configuration contains an unexpected map format.")
    return value


def _has_port(host):
    return isinstance(host, str) and host.endswith(":" + PORT)


def _require_private(config):
    for target, enabled in _map(config, "AllowFunnel").items():
        if not isinstance(enabled, bool):
            raise funnel.FunnelError("INVALID_CONFIG", "Funnel permissions contain an unexpected value.")
        if _has_port(target) and enabled:
            raise funnel.FunnelError("FUNNEL_CONFLICT", "Port 8446 already permits Funnel; refusing to expose the admin or change existing permissions.")


def planned_config(config, target):
    if not isinstance(config, dict):
        raise funnel.FunnelError("INVALID_CONFIG", "The serve configuration must be a JSON object.")
    _require_private(config)
    tcp = _map(config, "TCP")
    web = _map(config, "Web")
    for entry in _map(config, "Foreground").values():
        if not isinstance(entry, dict):
            raise funnel.FunnelError("INVALID_CONFIG", "Foreground serve configuration has an unexpected format.")
        _require_private(entry)
        if PORT in _map(entry, "TCP") or any(_has_port(host) for host in _map(entry, "Web")):
            raise funnel.FunnelError("FOREGROUND_CONFLICT", "An active foreground server occupies port 8446; no configuration was changed.")
    if any(_has_port(host) and host != target for host in web):
        raise funnel.FunnelError("WEB_PORT_OCCUPIED", "Another HTTPS server occupies port 8446; refusing to share or replace it.")
    tcp_exists = PORT in tcp
    web_exists = target in web
    if tcp_exists or web_exists:
        if tcp_exists and tcp[PORT] == EXPECTED_TCP and web_exists and web[target] == EXPECTED_SERVER:
            return copy.deepcopy(config), False
        raise funnel.FunnelError("ADMIN_PORT_OCCUPIED", "Port 8446 has different or partial configuration; refusing to replace it.")
    result = copy.deepcopy(config)
    result.setdefault("TCP", {})[PORT] = copy.deepcopy(EXPECTED_TCP)
    result.setdefault("Web", {})[target] = copy.deepcopy(EXPECTED_SERVER)
    return result, True


def verify_change(before, observed, target):
    # Planning an already configured exact target must be a no-op and must still
    # reject public Funnel permissions or a newly conflicting foreground server.
    _candidate, changed = planned_config(observed, target)
    if changed:
        raise funnel.FunnelError("VERIFY_ADMIN_FAILED", "The private admin server was absent after the update; no automatic overwrite was attempted.")
    if not funnel._contains_original(before, observed):
        raise funnel.FunnelError("VERIFY_PRESERVATION_FAILED", "The post-update read does not preserve every prior value; no automatic overwrite or rollback was attempted.")


def configure(client, host, apply=False, max_attempts=3):
    if not 1 <= max_attempts <= 5:
        raise funnel.FunnelError("INVALID_RETRIES", "CAS attempts must be between one and five.")
    target = host_port(host)
    for attempt in range(1, max_attempts + 1):
        before = client.read_config()
        candidate, changed = planned_config(before.config, target)
        result = {
            "mode": "apply" if apply else "dry-run",
            "hostPort": target,
            "mount": MOUNT,
            "proxy": PROXY,
            "access": "tailnet-only",
            "funnelEnabled": False,
            "changed": changed,
            "attempts": attempt,
            "beforeSha256": funnel._digest(before.config),
            "afterSha256": funnel._digest(candidate),
            "priorConfigurationPreserved": True,
        }
        if not apply:
            result["status"] = "planned" if changed else "already-configured"
            return result
        if changed:
            try:
                client.write_config(candidate, before.etag)
            except funnel.ConfigurationConflict:
                if attempt == max_attempts:
                    raise funnel.FunnelError("CAS_RETRY_EXHAUSTED", "Serve configuration changed during every bounded CAS attempt; no unguarded update was attempted.") from None
                continue
        after = client.read_config()
        verify_change(before.config, after.config, target)
        result["afterSha256"] = funnel._digest(after.config)
        result["status"] = "applied" if changed else "already-configured"
        return result
    raise funnel.FunnelError("CAS_RETRY_EXHAUSTED", "No guarded update completed.")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", required=True, help="Existing Tailscale hostname, without a port")
    parser.add_argument("--socket", default=funnel.DEFAULT_SOCKET)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--dry-run", action="store_true", help="Report a plan without writing (default)")
    mode.add_argument("--apply", action="store_true", help="Apply the private server with Etag compare-and-swap")
    parser.add_argument("--attempts", type=int, choices=range(1, 6), default=3)
    parser.add_argument("--timeout", type=float, default=10)
    arguments = parser.parse_args(argv)
    try:
        if not 0.1 <= arguments.timeout <= 30:
            raise funnel.FunnelError("INVALID_TIMEOUT", "Timeout must be between 0.1 and 30 seconds.")
        result = configure(funnel.LocalAPI(arguments.socket, arguments.timeout), arguments.host, arguments.apply, arguments.attempts)
        print(json.dumps(result, sort_keys=True))
        return 0
    except funnel.FunnelError as error:
        result = {"error": {"code": error.code, "message": str(error)}}
        if error.status is not None:
            result["error"]["httpStatus"] = error.status
        print(json.dumps(result, sort_keys=True), file=sys.stderr)
        return 3 if error.code == "LOCAL_API_FORBIDDEN" else 1


if __name__ == "__main__":
    sys.exit(main())
