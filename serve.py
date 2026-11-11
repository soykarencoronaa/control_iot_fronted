"""Servidor local para probar la app; fuerza el MIME correcto para módulos JS."""

import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class StaticHandler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
    }

    def send_head(self):
        # Evita que el navegador reutilice la respuesta vieja text/plain para JS.
        for header in ("If-Modified-Since", "If-None-Match"):
            if header in self.headers:
                del self.headers[header]
        return super().send_head()

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        super().end_headers()


def main():
    os.chdir(Path(__file__).resolve().parent)
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5500
    server = ThreadingHTTPServer(("127.0.0.1", port), StaticHandler)
    print(f"Control IoT disponible en http://127.0.0.1:{port}/ (Ctrl+C para cerrar)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor local detenido.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
