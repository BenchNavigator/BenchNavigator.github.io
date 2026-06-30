#!/usr/bin/env python3
"""Tiny static dev server for BenchNavigator.

Like `python -m http.server`, but sends `Cache-Control: no-store` so edits to the
ES modules (app.js, ui.js, logic.js) and stats.json show up on a plain reload
instead of being cached by the browser.

    python serve.py            # serves this folder on http://localhost:8765
    python serve.py 9000       # custom port
"""
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, max-age=0")
        self.send_header("Pragma", "no-cache")
        super().end_headers()

    def log_message(self, *args):  # keep the console quiet
        pass


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    print(f"BenchNavigator dev server -> http://localhost:{port}  (Ctrl+C to stop)")
    ThreadingHTTPServer(("", port), NoCacheHandler).serve_forever()
