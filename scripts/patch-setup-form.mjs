import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const file = resolve(process.cwd(), 'apps/web/app/setup/page.tsx');
let source = readFileSync(file, 'utf8');

source = source.replace(
  'const f = new FormData(e.currentTarget);',
  'const form = e.currentTarget;\n    const f = new FormData(form);'
);

source = source.replace('e.currentTarget.reset();', 'form.reset();');

source = source.replace(
  '<input name={key} type={type} required autoCapitalize={key === \'tenantSlug\' ? \'none\' : undefined} />',
  '<input name={key} type={type} required minLength={key === \'password\' ? 12 : key === \'tenantSlug\' ? 2 : undefined} autoCapitalize={key === \'tenantSlug\' ? \'none\' : undefined} />'
);

source = source.replace(
  "setMsg(error?.message || 'Falha ao inicializar. Verifique os dados e tente novamente.');",
  "const detail = String(error?.message || '');\n      if (detail.includes('invalid_bootstrap_payload')) setMsg('Confira os dados: slug com pelo menos 2 caracteres, e-mail válido e senha com no mínimo 12 caracteres.');\n      else if (detail.includes('invalid_bootstrap_token')) setMsg('Token de inicialização inválido.');\n      else if (detail.includes('platform_already_initialized')) setMsg('A plataforma já foi inicializada. Faça login.');\n      else setMsg(detail || 'Falha ao inicializar. Verifique os dados e tente novamente.');"
);

writeFileSync(file, source, 'utf8');

for (const relative of ['apps/web/app/app/inbox/page.tsx', 'apps/web/app/app/email/page.tsx']) {
  const target = resolve(process.cwd(), relative);
  if (!existsSync(target)) continue;
  const content = readFileSync(target, 'utf8');
  const endpoints = [...content.matchAll(/api\(\s*[`'\"]([^`'\"]+)/g)].map((match) => match[1]);
  console.log(`${relative} endpoints: ${[...new Set(endpoints)].join(', ') || 'none'}`);

  if (relative.includes('/inbox/')) {
    const marker = content.indexOf("api('/inbox'");
    const start = Math.max(0, marker - 900);
    const end = Math.min(content.length, marker + 2400);
    console.log(`INBOX_CONTRACT_BEGIN\n${content.slice(start, end)}\nINBOX_CONTRACT_END`);
  }
}
