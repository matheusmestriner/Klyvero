// Fails when the web app calls an API route that the NestJS API does not expose.
//
// Collects every `@Get/@Post/...` route from apps/api/src/modules/**/*.controller.ts and every
// `api('/path')` call (method + path) made by apps/web, by the generated web routes
// (deploy/web-routes-v4.part.*, base64 gzip JSON) and by the build-time patch scripts,
// then reports the calls with no matching route.
//
// It checks routes only. Payload shapes are enforced at runtime by the API ValidationPipe.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { gunzipSync } from 'node:zlib';

const root = process.cwd();
const deploy = join(root, 'deploy');

// Keep in sync with scripts/materialize-web-routes.mjs: these pages come from git, not from the payload.
const SOURCE_MANAGED = new Set(['team/page.tsx', 'calendar/page.tsx', 'whatsapp/page.tsx', 'inbox/page.tsx', 'email/page.tsx', 'billing/page.tsx', 'prospecting/page.tsx', 'ai/page.tsx', 'campaigns/page.tsx']);

function parts(prefix) {
  return readdirSync(deploy)
    .filter((name) => name.startsWith(prefix))
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
    .map((name) => readFileSync(join(deploy, name), 'utf8').trim())
    .join('');
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (['node_modules', '.next', 'dist', '.git'].includes(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const normalize = (path) =>
  path
    .replace(/\$\{[^}]*\}/g, '{}')
    .replace(/:[A-Za-z]+/g, '{}')
    .split('?')[0]
    .replace(/\/{2,}/g, '/')
    .replace(/\/+$/, '') || '/';

// --- 1. routes exposed by the API --------------------------------------------------------
const routes = new Set();
for (const file of walk(join(root, 'apps', 'api', 'src', 'modules')).filter((f) => f.endsWith('controller.ts'))) {
  const source = readFileSync(file, 'utf8');
  const prefix = source.match(/@Controller\(\s*(?:'([^']*)')?\s*\)/)?.[1] ?? '';
  for (const match of source.matchAll(/@(Get|Post|Put|Patch|Delete)\(\s*(?:'([^']*)')?\s*\)/g)) {
    routes.add(`${match[1].toUpperCase()} ${normalize(`/${prefix}/${match[2] ?? ''}`)}`);
  }
}
if (routes.size < 50) throw new Error(`Only ${routes.size} API routes found; the API layout probably changed.`);

// --- 2. calls made by the web app --------------------------------------------------------
const sources = [];
for (const file of walk(join(root, 'apps', 'web')).filter((f) => /\.(ts|tsx)$/.test(f))) {
  sources.push({ name: relative(root, file), text: readFileSync(file, 'utf8') });
}
const generated = JSON.parse(gunzipSync(Buffer.from(parts('web-routes-v4.part.'), 'base64')).toString('utf8'));
for (const [name, text] of Object.entries(generated)) {
  if (!SOURCE_MANAGED.has(name)) sources.push({ name: `deploy/web-routes-v4 → ${name}`, text });
}
// Build-time patches inject api() calls into pages through escaped template strings.
for (const file of readdirSync(join(root, 'scripts')).filter((f) => f.startsWith('patch-') && f.endsWith('.mjs'))) {
  const text = readFileSync(join(root, 'scripts', file), 'utf8').replace(/\\`/g, '`').replace(/\\\$\{/g, '${');
  sources.push({ name: `scripts/${file}`, text });
}

const calls = new Map(); // "METHOD /path" -> Set(origin)
function addCall(method, path, origin) {
  const key = `${method} ${normalize(path)}`;
  if (!calls.has(key)) calls.set(key, new Set());
  calls.get(key).add(origin);
}

for (const { name, text } of sources) {
  for (const match of text.matchAll(/\bapi\(\s*([`'"])(\/[^`'"]*)\1\s*(?:,\s*\{([^}]*)\})?/g)) {
    const method = match[3]?.match(/method\s*:\s*['"](\w+)['"]/)?.[1]?.toUpperCase() ?? 'GET';
    addCall(method, match[2], name);
  }
  // const FOO_ENDPOINTS = ['/a', '/b'] iterated with api(path[, { method }])
  for (const array of text.matchAll(/const\s+([A-Z_]*ENDPOINTS)\s*=\s*\[([^\]]*)\]/g)) {
    const method = /PORTAL|WRITE|CREATE/.test(array[1]) ? 'POST' : 'GET';
    for (const literal of array[2].matchAll(/['"](\/[^'"]*)['"]/g)) addCall(method, literal[1], name);
  }
  // <ResourcePage path="/leads" …> lists with GET and creates with POST on the same path
  for (const resource of text.matchAll(/<ResourcePage[^>]*\spath="(\/[^"]*)"/g)) {
    addCall('GET', resource[1], name);
    addCall('POST', resource[1], name);
  }
}

// The phone app: api<T>('/path', { method }) for authenticated calls, post<T>('/path') for the auth endpoints
// and useResource<T>('/path') for GETs.
for (const file of walk(join(root, 'apps', 'mobile', 'src')).filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith('.test.ts'))) {
  const text = readFileSync(file, 'utf8');
  const name = relative(root, file);
  for (const match of text.matchAll(/\bapi(?:<[^>]*>)?\(\s*([`'"])(\/[^`'"]*)\1\s*(?:,\s*\{([^}]*)\})?/g)) {
    addCall(match[3]?.match(/method\s*:\s*['"](\w+)['"]/)?.[1]?.toUpperCase() ?? 'GET', match[2], name);
  }
  for (const match of text.matchAll(/\bpost(?:<[^>]*>)?\(\s*([`'"])(\/[^`'"]*)\1/g)) addCall('POST', match[2], name);
  for (const match of text.matchAll(/\buseResource(?:<[\s\S]*?>)?\(\s*([`'"])(\/[^`'"]*)\1/g)) addCall('GET', match[2], name);
}

// --- 3. compare --------------------------------------------------------------------------
const missing = [];
for (const [key, origins] of [...calls].sort()) {
  let found = routes.has(key);
  // `/prospecting/import${suffix}`: the dynamic part is glued to a literal, so match the literal.
  if (!found && /[^/]\{\}$/.test(key)) found = routes.has(key.replace(/\{\}$/, ''));
  if (!found) missing.push(`${key}   <- ${[...origins].join(', ')}`);
}

console.log(`API routes: ${routes.size} · web calls checked: ${calls.size}`);
if (missing.length) {
  console.error(`\n${missing.length} web call(s) have no matching API route:\n  ${missing.join('\n  ')}`);
  process.exit(1);
}
console.log('Web/API route contract is consistent.');
