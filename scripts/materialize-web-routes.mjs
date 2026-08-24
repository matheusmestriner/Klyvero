import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { gunzipSync } from 'node:zlib';

const root = process.cwd();
const payload = ['00', '01', '02', '03']
  .map((part) => readFileSync(join(root, 'deploy', `web-routes-v4.part.${part}`), 'utf8').trim())
  .join('');

const files = JSON.parse(gunzipSync(Buffer.from(payload, 'base64')).toString('utf8'));
const targetRoot = join(root, 'apps', 'web', 'app', 'app');
const sourceManagedRoutes = new Set(['team/page.tsx', 'calendar/page.tsx', 'whatsapp/page.tsx']);

for (const [relativePath, originalContent] of Object.entries(files)) {
  // These routes are maintained as normal TypeScript source. Keeping them out
  // of the generated payload prevents older bundled pages from replacing the
  // current implementation during pnpm preinstall on Render or CI.
  if (sourceManagedRoutes.has(relativePath)) continue;

  let content = originalContent;

  if (relativePath === 'inbox/page.tsx') {
    const endpoints = [...originalContent.matchAll(/api\(\s*[`'\"]([^`'\"]+)/g)].map((match) => match[1]);
    console.log(`Inbox compatibility endpoints: ${[...new Set(endpoints)].join(', ') || 'none'}`);
    content = content.replace('setSelected(s=>', 'setSelected((s:any)=>');
  }

  if (relativePath === 'page.tsx') {
    content = content.replace(
      'const width = Math.max(18, Math.round((stage.deals / maxDeals) * 100));',
      'const width = stage.deals <= 0 ? 0 : Math.max(18, Math.round((stage.deals / maxDeals) * 100));',
    );
  }

  if (relativePath === 'crm/page.tsx') {
    content = content.replace(
      "  const load = () => api('/crm/pipelines').then(setPipelines).catch(() => {});",
      `  const load = () => api('/crm/pipelines')\n    .then((payload: any) => {\n      const rows = Array.isArray(payload)\n        ? payload\n        : Array.isArray(payload?.items)\n          ? payload.items\n          : Array.isArray(payload?.data)\n            ? payload.data\n            : payload && typeof payload === 'object'\n              ? [payload]\n              : [];\n\n      setPipelines(rows.map((row: any) => ({\n        ...row,\n        stages: Array.isArray(row?.stages)\n          ? row.stages.map((stage: any) => ({ ...stage, deals: Array.isArray(stage?.deals) ? stage.deals : [] }))\n          : [],\n      })));\n    })\n    .catch(() => setPipelines([]));`,
    );

    content = content.replace(
      '    const deals = pipeline?.stages.flatMap((stage) => stage.deals ?? []) ?? [];',
      '    const stages = Array.isArray(pipeline?.stages) ? pipeline.stages : [];\n    const deals = stages.flatMap((stage) => Array.isArray(stage.deals) ? stage.deals : []);',
    );

    content = content.replace(
      '    const weighted = pipeline?.stages.reduce((sum, stage) => sum + (stage.deals ?? []).reduce((inner, deal) => inner + Number(deal.value || 0) * (stage.probability / 100), 0), 0) ?? 0;',
      '    const weighted = stages.reduce((sum, stage) => sum + (Array.isArray(stage.deals) ? stage.deals : []).reduce((inner, deal) => inner + Number(deal.value || 0) * (Number(stage.probability || 0) / 100), 0), 0);',
    );

    content = content.replace(
      '          stageId: String(form.get(\'stageId\') || pipeline.stages[0].id),',
      "          stageId: String(form.get('stageId') || pipeline.stages?.[0]?.id || ''),",
    );

    content = content.replace(
      '      {pipeline ? (',
      '      {pipeline && Array.isArray(pipeline.stages) && pipeline.stages.length > 0 ? (',
    );

    content = content.replace(
      ') : <div className="card empty-state"><Icon name="crm" size={30}/><strong>Preparando seu pipeline</strong><span>O pipeline principal é criado automaticamente no primeiro acesso.</span></div>}',
      ') : <div className="card empty-state"><Icon name="crm" size={30}/><strong>CRM disponível</strong><span>Nenhum estágio de pipeline foi encontrado ainda. A tela permanece acessível e será atualizada quando o pipeline estiver disponível.</span></div>}',
    );

    content = content.replace(
      '{show && pipeline && (',
      '{show && pipeline && Array.isArray(pipeline.stages) && pipeline.stages.length > 0 && (',
    );
  }

  const target = join(targetRoot, relativePath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content, 'utf8');
}

console.log(`Materialized ${Object.keys(files).length - sourceManagedRoutes.size} generated Klyvero operational routes; source-managed routes preserved.`);
