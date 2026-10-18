#!/usr/bin/env python3
"""Stub AI provider for the intake-provider E2E (synthetic, local only).

Serves HTTPS on 127.0.0.1 with a self-signed CA created by make_ca.sh.
POST <base>/chat/completions is answered with a fixed non-streaming chat
completion; every request body is logged to a file with the Authorization
header value redacted. A control file toggles HTTP 500 responses.

Usage:
  python3 stub_provider.py --port 8443 --cert server.pem --key server.key \
      --log stub-requests.log --mode-file stub-mode

Write "ok" or "500" to the mode file to choose the response per request.
"""

import argparse
import json
import ssl
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ANSWER = json.dumps({
    "spends": [{
        "amount": "41.20",
        "payee": "Stub Provider Mart",
        "category": "",
        "account": "",
        "date": "2026-10-05",
        "isInflow": False,
    }]
})

BAD_ANSWER = json.dumps({
    "spends": [{
        "amount": "-1,234.50",
        "payee": "Stub Provider Odd Mart",
        "category": "",
        "account": "",
        "date": "2026-02-30",
        "isInflow": False,
    }]
})

EMPTY_ANSWER = json.dumps({"spends": []})

CAT_ANSWER = json.dumps({
    "spends": [{
        "amount": "4.50",
        "payee": "Coffee Bean",
        "category": "Eating out",
        "account": "",
        "date": "2026-10-18",
        "isInflow": False,
    }]
})


class Handler(BaseHTTPRequestHandler):
    server_version = "StubProvider/1.0"
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):  # keep stderr quiet; log file is authoritative
        pass

    def _mode(self):
        try:
            return Path(self.server.mode_file).read_text().strip()
        except OSError:
            return "ok"

    def _log_request(self, body):
        record = {
            "time": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
            "method": self.command,
            "path": self.path,
            "headers": {
                k: ("<redacted>" if k.lower() == "authorization" else v)
                for k, v in self.headers.items()
            },
            "body": body.decode("utf-8", "replace"),
            "mode": self._mode(),
        }
        with self.server.lock:
            with open(self.server.log_path, "a") as fh:
                fh.write(json.dumps(record) + "\n")

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length)
        self._log_request(body)
        if self.path.rstrip("/") != "/v1/chat/completions":
            self._send(404, {"error": {"message": "not found", "type": "not_found"}})
            return
        if self._mode() == "hang":
            import time
            time.sleep(120)
        if self._mode() == "500":
            self._send(500, {"error": {"message": "stub forced failure", "type": "server_error"}})
            return
        answer = {"bad": BAD_ANSWER, "empty": EMPTY_ANSWER, "cat": CAT_ANSWER}.get(self._mode(), ANSWER)
        payload = {
            "id": "chatcmpl-stub",
            "object": "chat.completion",
            "created": int(time.time()),
            "model": "stub-model",
            "choices": [{
                "index": 0,
                "message": {"role": "assistant", "content": answer},
                "finish_reason": "stop",
            }],
            "usage": {"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2},
        }
        self._send(200, payload)

    def do_GET(self):
        self._send(404, {"error": {"message": "not found", "type": "not_found"}})

    def _send(self, status, obj):
        data = json.dumps(obj).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8443)
    ap.add_argument("--cert", required=True)
    ap.add_argument("--key", required=True)
    ap.add_argument("--log", required=True)
    ap.add_argument("--mode-file", required=True)
    args = ap.parse_args()

    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    server.log_path = args.log
    server.mode_file = args.mode_file
    server.lock = threading.Lock()
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ctx.load_cert_chain(args.cert, args.key)
    server.socket = ctx.wrap_socket(server.socket, server_side=True)
    print(f"stub provider on https://127.0.0.1:{args.port}/v1 log={args.log} mode={args.mode_file}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
