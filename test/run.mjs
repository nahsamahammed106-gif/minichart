// Runs the browser tests in headless Chrome. No dependencies: Node 22+ (built-in fetch/WebSocket) and a Chrome binary.
// Usage: node test/run.mjs   (set CHROME=/path/to/chrome if it isn't found)
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { join, extname, normalize } from 'node:path';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const root = join(import.meta.dirname, '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript' };
const server = createServer(async (req, res) => {
  try {
    const file = join(root, normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^(\.\.[/\\])+/, ''));
    const body = await readFile(file); res.writeHead(200, { 'content-type': types[extname(file)] || 'text/plain' }); res.end(body); }
  catch { res.writeHead(404); res.end(); }
}).listen(0, '127.0.0.1');
await new Promise(r => server.once('listening', r));
const base = `http://127.0.0.1:${server.address().port}`;

const chromePath = process.env.CHROME || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(existsSync);
if (!chromePath) { console.error('Chrome not found. Set CHROME=/path/to/chrome'); process.exit(2); }
const profile = mkdtempSync(join(tmpdir(), 'mc-'));
const chrome = spawn(chromePath, ['--headless=new', '--remote-debugging-port=0', '--no-first-run', '--window-size=1280,900',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--autoplay-policy=no-user-gesture-required',
  `--user-data-dir=${profile}`, ...(process.env.GITHUB_ACTIONS ? ['--no-sandbox'] : []), 'about:blank']); // GitHub's Ubuntu runners block Chrome's sandbox
const port = await new Promise((ok, bad) => {
  chrome.stderr.on('data', d => { const m = /ws:\/\/127\.0\.0\.1:(\d+)\//.exec(d); if (m) ok(m[1]); });
  chrome.on('exit', c => bad(new Error('Chrome exited ' + c)));
});

// Open a page, then poll a global until the page sets it.
async function run(path, global, ms = 180000) {
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?${base}${path}`, { method: 'PUT' })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r, { once: true }));
  let id = 0;
  const call = (method, params) => new Promise(r => {
    const my = ++id;
    ws.addEventListener('message', function on(e) { const m = JSON.parse(e.data); if (m.id === my) { ws.removeEventListener('message', on); r(m.result); } });
    ws.send(JSON.stringify({ id: my, method, params }));
  });
  for (const end = Date.now() + ms; Date.now() < end; await new Promise(r => setTimeout(r, 500))) {
    const r = await call('Runtime.evaluate', { expression: `JSON.stringify(window.${global} || null)` });
    const v = JSON.parse(r?.result?.value ?? 'null');
    if (v) { ws.close(); return v; }
  }
  ws.close();
  throw new Error(`${path}: timed out waiting for window.${global}`);
}

let failed = false;
try {
  const smoke = await run('/test/smoke.html', 'smoke');
  console.log(`smoke: ${smoke.passed}/${smoke.total} passed`);
  for (const f of smoke.fails) console.log(`  ✗ ${f.name} — ${f.err}`);
  failed ||= smoke.fails.length > 0;

  const csp = await run('/test/csp.html', 'csp', 20000);
  const cspOk = csp.styled && csp.rendered && csp.destroyed === true && csp.violations.length === 0;
  console.log(`csp:   ${cspOk ? 'ok' : 'FAILED ' + JSON.stringify(csp)}`);
  failed ||= !cspOk;
} catch (e) { console.error(e.message); failed = true; }
finally {
  chrome.kill(); server.close();
  await new Promise(r => { chrome.once('exit', r); setTimeout(r, 3000); }); // let Chrome release its profile
  try { rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* temp dir; the OS cleans it */ }
}
process.exit(failed ? 1 : 0);
