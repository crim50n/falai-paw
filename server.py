#!/usr/bin/env python3
"""
Simple HTTP server for FalAI development
Serves static files and provides endpoint discovery
"""
import http.server
import socketserver
import json
import os
from pathlib import Path

class FalAIHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        # Handle endpoint discovery
        if self.path == '/endpoints':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()

            # Find all openapi.json files in endpoints directory
            endpoints = []
            endpoints_dir = Path('endpoints')
            if endpoints_dir.exists():
                for openapi_file in endpoints_dir.glob('**/openapi.json'):
                    endpoints.append(str(openapi_file))

            self.wfile.write(json.dumps(endpoints).encode())
            return

        # Serve static files
        super().do_GET()

    def end_headers(self):
        # Add CORS headers for API requests
        if self.path.startswith('/endpoints'):
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
            self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        super().end_headers()

if __name__ == '__main__':
    PORT = 8000

    print(f"FalAI Development Server")
    print(f"Serving at http://localhost:{PORT}")
    print(f"Press Ctrl+C to stop")

    with socketserver.TCPServer(("", PORT), FalAIHandler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServer stopped")
            httpd.shutdown()