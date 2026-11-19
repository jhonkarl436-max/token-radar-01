import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import http from 'http';
import { parseSnapshot, buildRadar } from '../lib/model.ts';

const domainSha = '8097045f0459c96c4cdc76e3a1af4e0f43f640b4b59c43d6db35e3641c0264c6';
const userDataDir = `/tmp/chrome-radar-${Date.now()}`;
const indexPath = path.resolve('out/dashboard/index.html');
const fileUrlBase = `file://${indexPath}`;

console.log('Reading snapshot to get rank 1 slug...');
const rawSnap = JSON.parse(fs.readFileSync('../token-radar-01-kit/input/snapshot.json', 'utf8'));
const snap = parseSnapshot(rawSnap);
const { board } = buildRadar(snap);
const rank1Slug = board[0].slug;
console.log('Rank 1 slug for detail shot:', rank1Slug);

const chromeArgs = [
  '--headless=new',
  '--no-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu-sandbox',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  `--hatch-webgl-allowed-domains-file=/run/hatch/runtime-cell/browser-webgl-allowed-domains.txt`,
  `--hatch-webgl-allowed-domains-sha256=${domainSha}`,
  '--remote-debugging-port=9333',
  `--user-data-dir=${userDataDir}`,
  '--window-size=1440,900',
  'about:blank'
];

console.log('Launching headless Chrome...');
const chromeProc = spawn('/opt/meta-chromium/chrome', chromeArgs, {
  stdio: ['ignore', 'pipe', 'pipe']
});

chromeProc.stdout.on('data', (d) => process.stdout.write(`[Chrome] ${d}`));
chromeProc.stderr.on('data', (d) => process.stderr.write(`[Chrome Error] ${d}`));

async function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForHttp(url, retries = 30) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fetchJSON(url);
    } catch (e) {
      await sleep(500);
    }
  }
  throw new Error('Chrome remote debugging port not ready');
}

async function mainCapture() {
  await waitForHttp('http://127.0.0.1:9333/json/version');
  console.log('Chrome CDP debug port ready.');

  const targets = await fetchJSON('http://127.0.0.1:9333/json/list');
  const target = targets.find(t => t.type === 'page');
  if (!target) throw new Error('No page target found in Chrome');

  const wsUrl = target.webSocketDebuggerUrl;
  const ws = new WebSocket(wsUrl);

  let messageId = 1;
  const pending = new Map();

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  };

  async function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = messageId++;
      pending.set(id, (res) => {
        if (res.error) reject(new Error(JSON.stringify(res.error)));
        else resolve(res.result);
      });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  await new Promise((resolve) => {
    if (ws.readyState === WebSocket.OPEN) resolve();
    else ws.onopen = resolve;
  });

  console.log('Connected to Chrome via CDP WebSocket.');

  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false
  });

  await send('Page.enable');

  const screenshotsDir = path.resolve('screenshots');
  fs.mkdirSync(screenshotsDir, { recursive: true });

  const urls = [
    { name: '1-board.jpg', url: fileUrlBase },
    { name: '2-detail.jpg', url: `${fileUrlBase}#detail=${rank1Slug}` },
    { name: '3-filtered.jpg', url: `${fileUrlBase}#watchlist=1` }
  ];

  for (const item of urls) {
    console.log(`Navigating to ${item.url}...`);
    await send('Page.navigate', { url: item.url });
    
    let loaded = false;
    for (let i = 0; i < 40; i++) {
      await sleep(200);
      try {
        const evalRes = await send('Runtime.evaluate', {
          expression: "document.querySelectorAll('#board-tbody tr').length"
        });
        if (evalRes.result && evalRes.result.value > 5) {
          loaded = true;
          break;
        }
      } catch (e) {}
    }
    console.log(`Page loaded (${item.name}): ${loaded}`);
    await sleep(1000);

    console.log(`Capturing screenshot ${item.name}...`);
    const shot = await send('Page.captureScreenshot', {
      format: 'jpeg',
      quality: 85
    });

    const buf = Buffer.from(shot.data, 'base64');
    const outPath = path.join(screenshotsDir, item.name);
    fs.writeFileSync(outPath, buf);
    console.log(`Saved ${outPath} (${buf.length} bytes)`);
  }

  ws.close();
  chromeProc.kill();
  console.log('Capture completed successfully.');
}

mainCapture().catch((err) => {
  console.error('Capture failed:', err);
  chromeProc.kill();
  process.exit(1);
});
