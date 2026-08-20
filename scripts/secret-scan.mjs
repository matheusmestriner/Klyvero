import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const excludedDirs = new Set(['.git', 'node_modules', '.next', 'dist', 'coverage']);
const blockedNames = [
  /^\.env$/,
  /^\.env\.(?!example$).+/,
  /\.(pem|key|p12|pfx|jks|keystore)$/i,
  /\.(db|sqlite|sqlite3|dump|backup)$/i,
];
const patterns = [
  { name: 'private-key', re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { name: 'github-token', re: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/ },
  { name: 'aws-access-key', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'provider-key', re: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
  { name: 'jwt', re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/ },
  { name: 'credentialed-url', re: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|https?):\/\/[^:\s/$\{]+:[^@\s/$\{]+@/i },
];
const findings = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (excludedDirs.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    const rel = path.relative(root, full).replaceAll('\\', '/');
    if (entry.isDirectory()) { walk(full); continue; }
    if (!entry.isFile()) continue;
    if (blockedNames.some((re) => re.test(entry.name))) { findings.push({ type: 'blocked-file', path: rel }); continue; }
    const stat = fs.statSync(full);
    if (stat.size > 5 * 1024 * 1024) continue;
    let text;
    try { text = fs.readFileSync(full, 'utf8'); } catch { continue; }
    for (const pattern of patterns) if (pattern.re.test(text)) findings.push({ type: pattern.name, path: rel });
  }
}
walk(root);
if (findings.length) {
  console.error('Secret scan failed.');
  for (const finding of findings) console.error(`- ${finding.type}: ${finding.path}`);
  process.exit(1);
}
console.log('Secret scan passed.');
