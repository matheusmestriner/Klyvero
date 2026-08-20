import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { gunzipSync } from 'node:zlib';

const root = process.cwd();
const payload = ['00', '01', '02', '03']
  .map((part) => readFileSync(join(root, 'deploy', `web-routes-v4.part.${part}`), 'utf8').trim())
  .join('');

const files = JSON.parse(gunzipSync(Buffer.from(payload, 'base64')).toString('utf8'));
const targetRoot = join(root, 'apps', 'web', 'app', 'app');

for (const [relativePath, originalContent] of Object.entries(files)) {
  let content = originalContent;
  if (relativePath === 'inbox/page.tsx') {
    content = content.replace('setSelected(s=>', 'setSelected((s:any)=>');
  }
  if (relativePath === 'page.tsx') {
    content = content.replace(
      'const width = Math.max(18, Math.round((stage.deals / maxDeals) * 100));',
      'const width = stage.deals <= 0 ? 0 : Math.max(18, Math.round((stage.deals / maxDeals) * 100));',
    );
  }
  const target = join(targetRoot, relativePath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content, 'utf8');
}

console.log(`Materialized ${Object.keys(files).length} Klyvero operational routes.`);
