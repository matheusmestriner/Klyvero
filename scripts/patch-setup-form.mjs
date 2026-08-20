import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const file = resolve(process.cwd(), 'apps/web/app/setup/page.tsx');
let source = readFileSync(file, 'utf8');

source = source.replace(
  'const f = new FormData(e.currentTarget);',
  'const form = e.currentTarget;\n    const f = new FormData(form);'
);

source = source.replace('e.currentTarget.reset();', 'form.reset();');

writeFileSync(file, source, 'utf8');
