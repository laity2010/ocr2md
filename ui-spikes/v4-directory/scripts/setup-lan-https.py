#!/usr/bin/env python3
"""Provision Mac-local LAN TLS cert and per-user launchd proxy. Never touch
Cloudflare, iPad trust settings, existing 4176/4292 services or any book.
"""
import os
import subprocess
import sys
import ipaddress
import plistlib
import shutil
from pathlib import Path

ip = subprocess.check_output(['ipconfig', 'getifaddr', 'en0'], text=True).strip()
ipaddress.ip_address(ip)
if not ip.startswith(('192.168.', '10.', '172.')):
    raise SystemExit('LAN_IP_IS_NOT_EXPECTED_PRIVATE_NETWORK')
base = Path.home() / 'Library' / 'Application Support' / 'ocr2md' / 'lan-tls'
base.mkdir(parents=True, exist_ok=True, mode=0o700)
os.chmod(base, 0o700)
server_key, server_cert = base / 'server.key', base / 'server.crt'
ca_key, ca_cert = base / 'root-ca.key', base / 'root-ca.crt'
if not (server_key.exists() and server_cert.exists() and ca_key.exists() and ca_cert.exists()):
    if any(p.exists() for p in (server_key, server_cert, ca_key, ca_cert)):
        raise SystemExit('PARTIAL_LAN_CA_EXISTS_NO_OVERWRITE')
    openssl = shutil.which('openssl')
    if not openssl:
        raise SystemExit('OPENSSL_NOT_FOUND')
    def run(*args):
        subprocess.run([openssl, *args], check=True, stdout=subprocess.DEVNULL,
                       stderr=subprocess.DEVNULL)
    run('genrsa', '-out', str(ca_key), '3072')
    run('req', '-new', '-x509', '-sha256', '-days', '1825', '-key', str(ca_key),
        '-out', str(ca_cert), '-subj', '/CN=OCR2MD Local LAN Root CA',
        '-addext', 'basicConstraints=critical,CA:TRUE',
        '-addext', 'keyUsage=critical,keyCertSign,cRLSign')
    run('genrsa', '-out', str(server_key), '2048')
    csr = base / 'server.csr'
    run('req', '-new', '-key', str(server_key), '-out', str(csr), '-subj', f'/CN={ip}')
    extension = base / 'server.ext'
    extension.write_text('\n'.join([
        '[v3_req]', 'basicConstraints=critical,CA:FALSE',
        'keyUsage=critical,digitalSignature,keyEncipherment',
        'extendedKeyUsage=serverAuth', f'subjectAltName=IP:{ip}', '']) )
    run('x509', '-req', '-sha256', '-days', '365', '-in', str(csr),
        '-CA', str(ca_cert), '-CAkey', str(ca_key), '-CAcreateserial',
        '-out', str(server_cert), '-extfile', str(extension), '-extensions', 'v3_req')
    csr.unlink(missing_ok=True)
    extension.unlink(missing_ok=True)
    for private in (ca_key, server_key):
        os.chmod(private, 0o600)
    print('OCR2MD_LAN_CA_GENERATED_PRIVATE')
else:
    print('OCR2MD_LAN_CA_REUSED_EXISTING')

# The root CA *certificate* is public; never expose CA private key or leaf key.
stage = Path('/tmp/wcp-tripane-lan-v4-20261013/stage')
if not stage.is_dir():raise SystemExit('FASTDEV_STAGE_MISSING')
cert_download = stage / 'ocr2md-lan-root-ca.cer'
if cert_download.exists() and cert_download.read_bytes()!=ca_cert.read_bytes():
    raise SystemExit('ROOT_CA_PUBLIC_DOWNLOAD_WOULD_CHANGE')
cert_download.write_bytes(ca_cert.read_bytes())
cert_download.chmod(0o644)

label='bid.laity.ocr2md-lan-https'
agent=Path.home()/'Library'/'LaunchAgents'/f'{label}.plist'
agent.parent.mkdir(parents=True, exist_ok=True)
gateway=Path(__file__).resolve().parent/'lan-https-gateway.py'
log=base/'gateway.log'
plist={'Label':label, 'ProgramArguments':[sys.executable,str(gateway),'--bind',ip,
 '--port','4443','--upstream-port','4292','--cert-dir',str(base)],
 'RunAtLoad':True,'KeepAlive':True,
 'StandardOutPath':str(log),'StandardErrorPath':str(log)}
if agent.exists() and plistlib.loads(agent.read_bytes())!=plist:
    raise SystemExit('EXISTING_LAN_LAUNCHAGENT_DIFFERS_NO_OVERWRITE')
if not agent.exists():
    agent.write_bytes(plistlib.dumps(plist))
    print('OCR2MD_LAN_HTTPS_LAUNCHAGENT_WRITTEN')
else:
    print('OCR2MD_LAN_HTTPS_LAUNCHAGENT_REUSED')
uid=os.getuid()
probe=subprocess.run(['launchctl','print',f'gui/{uid}/{label}'],capture_output=True)
if probe.returncode!=0:
    subprocess.run(['launchctl','bootstrap',f'gui/{uid}',str(agent)],check=True)
    print('OCR2MD_LAN_HTTPS_SERVICE_STARTED')
else:
    print('OCR2MD_LAN_HTTPS_SERVICE_ALREADY_RUNNING')
print('OCR2MD_LAN_HTTPS_ADDRESS',f'https://{ip}:4443/v4-directory/')
print('OCR2MD_LAN_CA_PUBLIC_DOWNLOAD',f'http://{ip}:4292/ocr2md-lan-root-ca.cer')
