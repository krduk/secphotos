#!/usr/bin/env python3
import http.server
import socketserver
import ssl
import sys
import os
import socket
import subprocess
import argparse

def get_local_ip():
    """Get the primary local IP address of this machine."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        # Does not need to be reachable
        s.connect(('10.254.254.254', 1))
        ip = s.getsockname()[0]
    except Exception:
        ip = '127.0.0.1'
    finally:
        s.close()
    return ip

def generate_ssl_certificate(cert_file='cert.pem', key_file='key.pem'):
    """Generate a self-signed SSL certificate using openssl CLI."""
    if os.path.exists(cert_file) and os.path.exists(key_file):
        print(f"[*] Found existing SSL certificates ({cert_file}, {key_file})")
        return True

    print("[*] SSL certificates not found. Generating self-signed certificates...")
    try:
        cmd = [
            'openssl', 'req', '-x509', '-newkey', 'rsa:4096', 
            '-keyout', key_file, '-out', cert_file, 
            '-days', '365', '-nodes', 
            '-subj', '/C=JP/ST=Tokyo/L=Tokyo/O=SecPhotos/CN=localhost'
        ]
        subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        print(f"[+] SSL certificates generated successfully: {cert_file}, {key_file}")
        return True
    except subprocess.CalledProcessError as e:
        print(f"[-] Error generating SSL certificates: {e.stderr.decode()}", file=sys.stderr)
        return False
    except FileNotFoundError:
        print("[-] Error: 'openssl' command not found in your system PATH.", file=sys.stderr)
        print("[-] Please install openssl or copy your own 'cert.pem' and 'key.pem' to this directory.", file=sys.stderr)
        return False

def main():
    parser = argparse.ArgumentParser(description="SecPhotos Light Static File Dev Server")
    parser.add_argument('--port', type=int, default=8000, help='Port to run the server on (default: 8000)')
    parser.add_argument('--ssl', action='store_true', help='Enable HTTPS with self-signed SSL certificate')
    args = parser.parse_args()

    port = args.port
    local_ip = get_local_ip()
    
    # SimpleHTTPRequestHandler serves static files from current directory
    handler = http.server.SimpleHTTPRequestHandler
    
    # Ensure index.html is served if URL is "/"
    handler.extensions_map.update({
        '.html': 'text/html',
        '.css': 'text/css',
        '.js': 'application/javascript',
    })

    print(f"[*] Starting SecPhotos Dev Server on port {port}...")

    # Bind to all interfaces (0.0.0.0) so it's accessible from other devices (like iPhone) on the same network
    server_address = ('0.0.0.0', port)
    
    # Set reusable socket options
    class ReusableTCPServer(socketserver.TCPServer):
        allow_reuse_address = True

    try:
        httpd = ReusableTCPServer(server_address, handler)
        
        if args.ssl:
            if generate_ssl_certificate():
                # Setup SSL context
                context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
                context.load_cert_chain(certfile='cert.pem', keyfile='key.pem')
                
                # Wrap socket
                httpd.socket = context.wrap_socket(httpd.socket, server_side=True)
                
                print("\n==================================================")
                print("🔒 HTTPS (SSL) SERVER RUNNING")
                print("==================================================")
                print(f"Local access:   https://localhost:{port}")
                print(f"Network access: https://{local_ip}:{port}")
                print("==================================================")
                print("⚠️  Note for iPhone:")
                print("Since it is a self-signed certificate, your iPhone will show an SSL warning.")
                print("Tap 'Advanced' and 'Proceed' to bypass the warning and load the app.")
                print("Google OAuth will require this origin added to Authorized JavaScript Origins.")
                print("==================================================\n")
            else:
                print("[-] Failed to initialize SSL. Falling back to HTTP mode.")
                args.ssl = False
                
        if not args.ssl:
            print("\n==================================================")
            print("🔓 HTTP SERVER RUNNING (Unencrypted)")
            print("==================================================")
            print(f"Local access:   http://localhost:{port}")
            print(f"Network access: http://{local_ip}:{port}")
            print("==================================================")
            print("⚠️  Note for Google Identity Services / iOS Safari:")
            print("Certain features may be blocked on non-secure origins (HTTP) when accessed on your phone.")
            print("We recommend running with --ssl for full compatibility.")
            print("==================================================\n")

        print("[*] Press Ctrl+C to stop the server.")
        httpd.serve_forever()
        
    except KeyboardInterrupt:
        print("\n[*] Server stopped.")
        sys.exit(0)
    except Exception as e:
        print(f"[-] Error starting server: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__':
    main()
