import fs from 'fs';
import path from 'path';
import { parseSnapshot, buildRadar, boardIssue, dataScript } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

function parseArgs(): { input: string; output: string } {
  let input = '/input';
  let output = process.env.MAKEFUN_OUTPUT_DIR || '/output';

  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--input' && args[i + 1]) {
      input = args[i + 1];
      i++;
    } else if (args[i] === '--output' && args[i + 1]) {
      output = args[i + 1];
      i++;
    }
  }
  return { input, output };
}

function copyRecursive(src: string, dest: string) {
  if (!fs.existsSync(src)) return;
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    for (const entry of fs.readdirNames ? fs.readdirNames(src) : fs.readdirSync(src)) {
      if (entry.startsWith('.')) continue;
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else if (stat.isFile()) {
    const base = path.basename(src);
    if (base.startsWith('.')) return;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

function countScreenshots(dir: string): number {
  const screenshotsDir = path.join(dir, 'screenshots');
  if (!fs.existsSync(screenshotsDir)) return 0;
  const files = fs.readdirSync(screenshotsDir);
  return files.filter((f) => !f.startsWith('.') && fs.statSync(path.join(screenshotsDir, f)).isFile()).length;
}

function main() {
  const { input, output } = parseArgs();

  let snapshotPath = input;
  try {
    const stat = fs.statSync(input);
    if (stat.isDirectory()) {
      snapshotPath = path.join(input, 'snapshot.json');
    }
  } catch (err) {
    console.error(`Error accessing input path ${input}: ${err}`);
    process.exit(2);
  }

  if (!fs.existsSync(snapshotPath)) {
    console.error(`Snapshot file not found at ${snapshotPath}`);
    process.exit(2);
  }

  let rawData;
  try {
    rawData = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
  } catch (err) {
    console.error(`Failed to parse snapshot JSON from ${snapshotPath}: ${err}`);
    process.exit(2);
  }

  let snapshot;
  try {
    snapshot = parseSnapshot(rawData);
  } catch (err) {
    console.error(`Failed to initialize snapshot model: ${err}`);
    process.exit(2);
  }

  let board, radar;
  try {
    const res = buildRadar(snapshot);
    board = res.board;
    radar = res.radar;
  } catch (err) {
    console.error(`Failed to build radar: ${err}`);
    process.exit(1);
  }

  const issue = boardIssue(board, snapshot);
  if (issue !== null) {
    console.error(`Board validation failed: ${issue}`);
    process.exit(1);
  }

  fs.mkdirSync(output, { recursive: true });

  // 1. Write board.json
  const boardJsonPath = path.join(output, 'board.json');
  fs.writeFileSync(boardJsonPath, JSON.stringify({ rows: board }) + '\n', 'utf8');

  // 2. Write data.js
  const dataJsPath = path.join(output, 'data.js');
  fs.writeFileSync(dataJsPath, dataScript(radar), 'utf8');

  // 3. Copy dashboard/ and screenshots/
  copyRecursive('dashboard', path.join(output, 'dashboard'));
  copyRecursive('screenshots', path.join(output, 'screenshots'));

  // 4. Check screenshots count
  const ssCount = countScreenshots(output);
  if (ssCount < 3) {
    console.error(`Warning: found ${ssCount} screenshots (expected at least 3).`);
  }

  // 5. Write dossier.json
  try {
    buildDossier(output, {
      text_max_bytes: 65536,
      screenshots: { max: 4, max_bytes: 524288 },
      dashboard: { max_files: 400, max_bytes: 4194304 },
    });
  } catch (err) {
    console.error(`Failed to build dossier: ${err}`);
    if (ssCount < 3) {
      process.exit(1);
    }
  }

  if (ssCount < 3) {
    process.exit(1);
  }

  console.log(`Successfully processed snapshot. Protocols: ${snapshot.protocols.length}, Watchlist: ${snapshot.watchlist.length}, Board size: ${board.length}. Output written to ${output}.`);
}

main();
