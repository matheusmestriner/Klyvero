import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const pagePath = join(root, 'apps', 'web', 'app', 'app', 'whatsapp', 'page.tsx');
const cssPath = join(root, 'apps', 'web', 'app', 'app', 'whatsapp', 'whatsapp.module.css');
const marker = 'KLYVERO_WHATSAPP_THREAD_DELETE_V1';

function replaceOnce(source, needle, replacement, label) {
  if (!source.includes(needle)) throw new Error(`WhatsApp thread delete patch failed: ${label}`);
  return source.replace(needle, replacement);
}

let source = readFileSync(pagePath, 'utf8');
if (!source.includes(marker)) {
  source = replaceOnce(
    source,
    "  const [savingContact, setSavingContact] = useState(false);\n",
    "  const [savingContact, setSavingContact] = useState(false);\n  const [deletingThreadId, setDeletingThreadId] = useState('');\n",
    'delete state',
  );

  source = replaceOnce(
    source,
    "  function selectThread(thread: InboxThread) {\n",
    `  // ${marker}\n  async function deleteStoredInboxItem(messageId: string) {\n    if (!messageId || messageId.startsWith('local-')) return;\n    const encoded = encodeURIComponent(messageId);\n    try {\n      await api(\`/inbox/messages/\${encoded}\`, { method: 'DELETE' });\n    } catch {\n      await api(\`/inbox/\${encoded}\`, { method: 'DELETE' });\n    }\n  }\n\n  async function deleteConversation(thread: InboxThread) {\n    if (deletingThreadId) return;\n    const name = threadName(thread);\n    const items = Array.isArray(thread.messages) && thread.messages.length\n      ? thread.messages\n      : [{ id: thread.id } as InboxMessage];\n\n    if (!window.confirm(\`Excluir a conversa com \"\${name}\"? O histórico será removido do Klyvero, mas o contato será mantido.\`)) return;\n\n    setDeletingThreadId(thread.id);\n    setError('');\n    try {\n      for (const item of items) await deleteStoredInboxItem(item.id);\n\n      const phone = threadPhone(thread);\n      setThreads((rows) => rows.filter((row) => phone ? threadPhone(row) !== phone : row.id !== thread.id));\n\n      if (selectedId === thread.id || (selected && phone && threadPhone(selected) === phone)) {\n        setSelectedId('');\n        setSelectedContactId('');\n        setNewNumber('');\n        setMobileChat(false);\n      }\n    } catch (cause: any) {\n      setError(cause?.message || 'Não foi possível excluir a conversa.');\n      await loadInbox(true);\n    } finally {\n      setDeletingThreadId('');\n    }\n  }\n\n  function selectThread(thread: InboxThread) {\n`,
    'delete handler',
  );

  source = replaceOnce(
    source,
    `            {whatsappThreads.map((thread) => (\n              <button key={thread.id} type="button" className={\`${'${styles.thread} ${selected?.id === thread.id ? styles.threadActive : \'\'}'}\`} onClick={() => selectThread(thread)}>\n                <div className={styles.avatar}>{initials(threadName(thread))}</div>\n                <div className={styles.threadMain}>\n                  <div className={styles.threadTop}><span className={styles.threadName}>{threadName(thread)}</span><span className={styles.time}>{lastTime(thread)}</span></div>\n                  <div className={styles.preview}><span>{lastText(thread) || threadPhone(thread) || 'Sem mensagens'}</span></div>\n                </div>\n              </button>\n            ))}\n`,
    `            {whatsappThreads.map((thread) => (\n              <div key={thread.id} className={styles.threadRow}>\n                <button type="button" className={\`${'${styles.thread} ${selected?.id === thread.id ? styles.threadActive : \'\'}'}\`} onClick={() => selectThread(thread)}>\n                  <div className={styles.avatar}>{initials(threadName(thread))}</div>\n                  <div className={styles.threadMain}>\n                    <div className={styles.threadTop}><span className={styles.threadName}>{threadName(thread)}</span><span className={styles.time}>{lastTime(thread)}</span></div>\n                    <div className={styles.preview}><span>{lastText(thread) || threadPhone(thread) || 'Sem mensagens'}</span></div>\n                  </div>\n                </button>\n                <button\n                  type="button"\n                  className={styles.threadDelete}\n                  disabled={Boolean(deletingThreadId)}\n                  onClick={() => void deleteConversation(thread)}\n                  aria-label={\`Excluir conversa com \${threadName(thread)}\`}\n                  title="Excluir conversa"\n                >\n                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">\n                    <path d="M3 6h18" />\n                    <path d="M8 6V4h8v2" />\n                    <path d="m19 6-1 14H6L5 6" />\n                    <path d="M10 11v5M14 11v5" />\n                  </svg>\n                </button>\n              </div>\n            ))}\n`,
    'conversation row',
  );

  writeFileSync(pagePath, source, 'utf8');
}

let css = readFileSync(cssPath, 'utf8');
if (!css.includes(marker)) {
  css += `\n/* ${marker} */\n.threadRow{position:relative;display:flex;align-items:stretch;border-bottom:1px solid var(--ui-border)}\n.threadRow .thread{flex:1;min-width:0;border-bottom:0!important;padding-right:48px!important}\n.threadDelete{position:absolute;right:11px;top:50%;transform:translateY(-50%);width:30px;height:30px;border:1px solid transparent;border-radius:9px;background:transparent;color:var(--ui-subtle);display:grid;place-items:center;padding:0;cursor:pointer;opacity:.72;transition:background .16s ease,color .16s ease,border-color .16s ease,opacity .16s ease}\n.threadDelete:hover,.threadDelete:focus-visible{color:#ef4444;background:color-mix(in srgb,#ef4444 10%,transparent);border-color:color-mix(in srgb,#ef4444 28%,transparent);opacity:1;outline:none}\n.threadDelete:disabled{opacity:.35;cursor:not-allowed}\n.threadRow:has(.threadActive) .threadDelete{color:color-mix(in srgb,#ef4444 76%,var(--ui-text));opacity:.9}\n@media (pointer:coarse){.threadDelete{opacity:.9}}\n`;
  writeFileSync(cssPath, css, 'utf8');
}

console.log('WhatsApp conversation delete control patched.');
