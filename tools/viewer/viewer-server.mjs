import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import { exec } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const HOST = '127.0.0.1';
const PORT = Number(process.env.VIEWER_PORT || 5173);
const FILE = path.join(__dirname, 'live-viewer.html');
const API = process.env.API_URL || 'http://127.0.0.1:3000';

const RID_FRESH_MS = 15000;

const DEVICES = [
  { name: 'ADS-B bridge (USR-TCP232-ED2)', ip: '192.168.0.8', port: 8235 },
  { name: 'AIS112E (AIS receiver)', ip: '192.168.0.7', port: 80 },
  { name: 'URM-02 (Remote ID)', via: 'rid', display: 'USB/UDP live feed' },
  { name: 'USR IoT router', ip: '192.168.0.6', port: 80 },
];

function tcpOk(ip, port, ms) {
  return new Promise((resolve) => {
    const c = new net.Socket();
    const t = setTimeout(() => { c.destroy(); resolve(false); }, ms);
    c.setTimeout(ms);
    c.once('connect', () => { clearTimeout(t); c.destroy(); resolve(true); });
    c.once('error', () => { clearTimeout(t); c.destroy(); resolve(false); });
    c.once('timeout', () => { clearTimeout(t); c.destroy(); resolve(false); });
    c.connect(port, ip);
  });
}

async function ridFresh() {
  try {
    const r = await fetch(API + '/api/health', { signal: AbortSignal.timeout(3000) });
    if (!r.ok) return false;
    const h = await r.json();
    const s = h.ridSecondsSinceLastMessage;
    return typeof s === 'number' && s * 1000 < RID_FRESH_MS;
  } catch {
    return false;
  }
}

async function probe(dev) {
  if (dev.via === 'rid') return { ...dev, online: await ridFresh(), detail: 'live feed' };
  if (dev.port) return tcpOk(dev.ip, dev.port, 2000).then((ok) => ({ ...dev, online: ok }));
  return new Promise((resolve) => {
    exec(`ping -n 1 -w 1200 ${dev.ip}`, (err) => resolve({ ...dev, online: !err }));
  });
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.url === '/devices') {
      const results = await Promise.all(DEVICES.map(probe));
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ updatedAt: Date.now(), devices: results }));
      return;
    }
    if (req.url.startsWith('/api/')) {
      const ap = await fetch(API + req.url, { signal: AbortSignal.timeout(8000) });
      const body = await ap.arrayBuffer();
      res.writeHead(ap.status, {
        'Content-Type': ap.headers.get('content-type') || 'application/json',
        'Cache-Control': 'no-store',
      });
      res.end(Buffer.from(body));
      return;
    }
    const html = await readFile(FILE);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(html);
  } catch (e) {
    res.writeHead(500);
    res.end('err: ' + e.message);
  }
});

server.listen(PORT, HOST, () => {
  console.log('VIEWER http://' + HOST + ':' + PORT + ' (proxy -> ' + API + ')');
});