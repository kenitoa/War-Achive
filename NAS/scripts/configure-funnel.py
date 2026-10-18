#!/usr/bin/env python3
"""Add only the archive's handler to an already public Tailscale HTTPS server.

The v1.58.2 LocalAPI contract uses GET Etag and POST If-Match:
https://github.com/tailscale/tailscale/blob/v1.58.2/client/tailscale/localclient.go#L1065-L1101
https://github.com/tailscale/tailscale/blob/v1.58.2/ipn/localapi/localapi.go#L915-L959

No TCP/network fallback, permission changes, Funnel enablement or config reset is
performed. The default invocation is a dry run; --apply explicitly enables POST.
"""

import argparse
import copy
from dataclasses import dataclass
import hashlib
import http.client
import json
import os
import re
import socket
import sys


API_PATH = "/localapi/v0/serve-config"
DEFAULT_SOCKET = "/var/packages/Tailscale/var/tailscaled.sock"
MOUNT = "/war-archive-api"
PROXY = "http://127.0.0.1:9232"
MAX_RESPONSE_BYTES = 4 * 1024 * 1024


class FunnelError(Exception):
    def __init__(self, code, message, status=None):
        super().__init__(message)
        self.code = code
        self.status = status


class ConfigurationConflict(FunnelError):
    pass


@dataclass
class Snapshot:
    config: dict
    etag: str


class UnixHTTPConnection(http.client.HTTPConnection):
    def __init__(self, socket_path, timeout):
        super().__init__("local-tailscaled.sock", timeout=timeout)
        self.socket_path = socket_path

    def connect(self):
        connection = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        connection.settimeout(self.timeout)
        try:
            connection.connect(self.socket_path)
        except OSError:
            connection.close()
            raise
        self.sock = connection


def _json_without_duplicates(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate JSON key")
        result[key] = value
    return result


def _reject_json_constant(_value):
    raise ValueError("non-finite JSON number")


def _canonical_bytes(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode("utf-8")


def _digest(value):
    return hashlib.sha256(_canonical_bytes(value)).hexdigest()


class LocalAPI:
    """Unix socket only; the daemon still enforces the process's peer identity."""

    def __init__(self, socket_path=DEFAULT_SOCKET, timeout=10):
        if not os.path.isabs(socket_path):
            raise FunnelError("INVALID_SOCKET", "An absolute Unix socket path is required.")
        self.socket_path = socket_path
        self.timeout = timeout

    def _request(self, method, config=None, etag=None):
        connection = UnixHTTPConnection(self.socket_path, self.timeout)
        body = None if config is None else _canonical_bytes(config)
        headers = {"Accept": "application/json", "User-Agent": "war-archive-funnel/1"}
        if body is not None:
            headers["Content-Type"] = "application/json"
            if not etag or "\r" in etag or "\n" in etag:
                raise FunnelError("MISSING_ETAG", "Refusing to update without a valid Etag.")
            headers["If-Match"] = etag
        try:
            connection.request(method, API_PATH, body=body, headers=headers)
            response = connection.getresponse()
            payload = response.read(MAX_RESPONSE_BYTES + 1)
            status = response.status
            response_etag = response.getheader("Etag")
            if len(payload) > MAX_RESPONSE_BYTES:
                raise FunnelError("RESPONSE_TOO_LARGE", "LocalAPI response exceeded the size limit.", status)
            if status in (401, 403):
                raise FunnelError("LOCAL_API_FORBIDDEN", "Tailscale LocalAPI denied this process. Use an authorized operator; no fallback or permission change was attempted.", status)
            if status in (409, 412):
                raise ConfigurationConflict("CAS_CONFLICT", "Serve configuration changed concurrently.", status)
            if status != 200:
                raise FunnelError("LOCAL_API_HTTP_ERROR", "Tailscale LocalAPI returned HTTP %s for %s." % (status, method), status)
            return payload, response_etag
        except (OSError, http.client.HTTPException):
            raise FunnelError("LOCAL_API_CONNECTION_ERROR", "Could not complete the Unix socket request; no network fallback was attempted.") from None
        finally:
            connection.close()

    def read_config(self):
        body, etag = self._request("GET")
        if not etag or len(etag) > 256 or "\r" in etag or "\n" in etag:
            raise FunnelError("MISSING_ETAG", "LocalAPI did not return a valid Etag; refusing an unguarded update.")
        try:
            config = json.loads(body, object_pairs_hook=_json_without_duplicates, parse_constant=_reject_json_constant)
        except (ValueError, UnicodeError):
            raise FunnelError("INVALID_CONFIG", "LocalAPI did not return a valid unique-key JSON configuration.") from None
        if not isinstance(config, dict):
            raise FunnelError("MISSING_PUBLIC_SERVER", "An existing public HTTPS configuration is required; no new server will be created.")
        return Snapshot(config, etag)

    def write_config(self, config, etag):
        self._request("POST", config, etag)


def host_port(host):
    if not isinstance(host, str) or len(host) > 253 or not host.endswith(".ts.net") or any(not re.fullmatch(r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?", label) for label in host.split(".")):
        raise FunnelError("INVALID_HOST", "Supply the existing lowercase Tailscale DNS hostname without a scheme, path or port.")
    return host + ":443"


def planned_config(config, target):
    """Copy the original and change exactly one previously unused handler key."""
    if not isinstance(config, dict):
        raise FunnelError("INVALID_CONFIG", "The serve configuration must be a JSON object.")
    tcp_map = config.get("TCP")
    tcp = tcp_map.get("443") if isinstance(tcp_map, dict) else None
    if not isinstance(tcp, dict) or tcp.get("HTTPS") is not True or tcp.get("HTTP") or tcp.get("TCPForward"):
        raise FunnelError("HTTPS_NOT_ENABLED", "Existing port 443 must already serve HTTPS; it will not be enabled or altered.")
    funnel = config.get("AllowFunnel")
    if not isinstance(funnel, dict) or funnel.get(target) is not True:
        raise FunnelError("FUNNEL_NOT_ENABLED", "Funnel must already be enabled for the exact hostname and port; no network rights will be enabled.")
    web = config.get("Web")
    server = web.get(target) if isinstance(web, dict) else None
    if not isinstance(server, dict) or not isinstance(server.get("Handlers"), dict):
        raise FunnelError("MISSING_PUBLIC_SERVER", "The exact public HTTPS server and its handler map must already exist.")
    foreground = config.get("Foreground") or {}
    if not isinstance(foreground, dict):
        raise FunnelError("INVALID_CONFIG", "Foreground serve configuration has an unexpected format.")
    for entry in foreground.values():
        if not isinstance(entry, dict):
            raise FunnelError("INVALID_CONFIG", "Foreground serve configuration has an unexpected format.")
        foreground_web = entry.get("Web") or {}
        foreground_tcp = entry.get("TCP") or {}
        if not isinstance(foreground_web, dict) or not isinstance(foreground_tcp, dict):
            raise FunnelError("INVALID_CONFIG", "Foreground serve configuration has an unexpected format.")
        if target in foreground_web or "443" in foreground_tcp:
            raise FunnelError("FOREGROUND_CONFLICT", "An active foreground configuration may shadow this server; no configuration was changed.")
    handlers = server["Handlers"]
    expected = {"Proxy": PROXY}
    if MOUNT in handlers:
        if handlers[MOUNT] != expected:
            raise FunnelError("HANDLER_OCCUPIED", "The archive prefix already has a different handler; refusing to replace it.")
        return copy.deepcopy(config), False
    if any(isinstance(path, str) and path.startswith(MOUNT + "/") for path in handlers):
        raise FunnelError("HANDLER_OCCUPIED", "An existing handler occupies the archive prefix; refusing to shadow it.")
    result = copy.deepcopy(config)
    result["Web"][target]["Handlers"][MOUNT] = expected
    return result, True


def _contains_original(original, observed):
    if isinstance(original, dict):
        return isinstance(observed, dict) and all(key in observed and _contains_original(value, observed[key]) for key, value in original.items())
    return type(original) is type(observed) and original == observed


def verify_change(before, observed, target):
    web = observed.get("Web") if isinstance(observed, dict) else None
    server = web.get(target) if isinstance(web, dict) else None
    handlers = server.get("Handlers") if isinstance(server, dict) else None
    if not isinstance(handlers, dict) or handlers.get(MOUNT) != {"Proxy": PROXY}:
        raise FunnelError("VERIFY_HANDLER_FAILED", "The archive handler was not present in the post-update read; no rollback of other services was attempted.")
    if not _contains_original(before, observed):
        raise FunnelError("VERIFY_PRESERVATION_FAILED", "The post-update read does not preserve every prior configuration value; no automatic overwrite or rollback was attempted.")


def configure(client, host, apply=False, max_attempts=3):
    if not 1 <= max_attempts <= 5:
        raise FunnelError("INVALID_RETRIES", "CAS attempts must be between one and five.")
    target = host_port(host)
    for attempt in range(1, max_attempts + 1):
        before = client.read_config()
        candidate, changed = planned_config(before.config, target)
        result = {
            "mode": "apply" if apply else "dry-run",
            "hostPort": target,
            "mount": MOUNT,
            "proxy": PROXY,
            "changed": changed,
            "attempts": attempt,
            "beforeSha256": _digest(before.config),
            "afterSha256": _digest(candidate),
            "priorConfigurationPreserved": True,
        }
        if not apply:
            result["status"] = "planned" if changed else "already-configured"
            return result
        if changed:
            try:
                client.write_config(candidate, before.etag)
            except ConfigurationConflict:
                if attempt == max_attempts:
                    raise FunnelError("CAS_RETRY_EXHAUSTED", "Serve configuration changed during every bounded CAS attempt; no unguarded update was attempted.") from None
                continue
        after = client.read_config()
        verify_change(before.config, after.config, target)
        result["afterSha256"] = _digest(after.config)
        result["status"] = "applied" if changed else "already-configured"
        return result
    raise FunnelError("CAS_RETRY_EXHAUSTED", "No guarded update completed.")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", required=True, help="Existing Tailscale hostname, without :443")
    parser.add_argument("--socket", default=DEFAULT_SOCKET)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--dry-run", action="store_true", help="Read and report a plan without writing (default)")
    mode.add_argument("--apply", action="store_true", help="Apply the single handler with Etag compare-and-swap")
    parser.add_argument("--attempts", type=int, choices=range(1, 6), default=3)
    parser.add_argument("--timeout", type=float, default=10)
    arguments = parser.parse_args(argv)
    try:
        if not 0.1 <= arguments.timeout <= 30:
            raise FunnelError("INVALID_TIMEOUT", "Timeout must be between 0.1 and 30 seconds.")
        result = configure(LocalAPI(arguments.socket, arguments.timeout), arguments.host, arguments.apply, arguments.attempts)
        print(json.dumps(result, sort_keys=True))
        return 0
    except FunnelError as error:
        result = {"error": {"code": error.code, "message": str(error)}}
        if error.status is not None:
            result["error"]["httpStatus"] = error.status
        print(json.dumps(result, sort_keys=True), file=sys.stderr)
        return 3 if error.code == "LOCAL_API_FORBIDDEN" else 1


if __name__ == "__main__":
    sys.exit(main())
