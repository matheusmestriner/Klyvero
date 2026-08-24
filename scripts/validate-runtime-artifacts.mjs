import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';

const root = process.cwd();
const deploy = join(root, 'deploy');

function parts(prefix) {
  return readdirSync(deploy)
    .filter((name) => name.startsWith(prefix))
    .sort((left, right) => left.localeCompare(right, 'en', { numeric: true }));
}

function decodeParts(prefix) {
  const names = parts(prefix);
  if (!names.length) throw new Error(`No runtime parts found for ${prefix}`);
  const payload = names.map((name) => readFileSync(join(deploy, name), 'utf8').trim()).join('');
  return gunzipSync(Buffer.from(payload, 'base64'));
}

function validateAPI() {
  const source = decodeParts('free-api-v3.part.').toString('utf8');
  if (!source.includes('/api/v1/whatsapp')) {
    throw new Error('Free API runtime is missing the WhatsApp public contract');
  }
  if (!source.includes('/auth/refresh')) {
    throw new Error('Free API runtime is missing authentication refresh support');
  }

  const dir = mkdtempSync(join(tmpdir(), 'klyvero-runtime-'));
  const target = join(dir, 'server.mjs');
  try {
    writeFileSync(target, source, 'utf8');
    const check = spawnSync(process.execPath, ['--check', target], { encoding: 'utf8' });
    if (check.status !== 0) {
      throw new Error(`Free API runtime syntax check failed: ${check.stderr || check.stdout}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function validateWebRoutes() {
  const payload = ['00', '01', '02', '03']
    .map((part) => readFileSync(join(deploy, `web-routes-v4.part.${part}`), 'utf8').trim())
    .join('');
  const routes = JSON.parse(gunzipSync(Buffer.from(payload, 'base64')).toString('utf8'));
  for (const required of ['page.tsx', 'crm/page.tsx', 'inbox/page.tsx']) {
    if (typeof routes[required] !== 'string' || routes[required].length < 20) {
      throw new Error(`Generated web routes are missing ${required}`);
    }
  }
}

validateAPI();
validateWebRoutes();
console.log('Klyvero runtime artifacts are internally consistent.');
