import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

function replaceOnce(source, needle, replacement, label) {
  if (!source.includes(needle)) throw new Error(`Messaging deletion patch failed: ${label}`);
  return source.replace(needle, replacement);
}

function patchWhatsApp() {
  const path = join(root, 'apps', 'web', 'app', 'app', 'whatsapp', 'page.tsx');
  let source = readFileSync(path, 'utf8');
  if (source.includes('KLYVERO_MESSAGING_DELETE_V1')) return;

  source = replaceOnce(
    source,
    "  const [savingContact, setSavingContact] = useState(false);\n",
    "  const [savingContact, setSavingContact] = useState(false);\n  const [deletingId, setDeletingId] = useState('');\n  const [notice, setNotice] = useState('');\n",
    'whatsapp deletion state',
  );

  source = replaceOnce(
    source,
    "  const target = threadPhone(selected) || contactPhone(selectedContact) || normalizePhone(newNumber);\n",
    "  const target = threadPhone(selected) || contactPhone(selectedContact) || normalizePhone(newNumber);\n  const activeContact = selectedContact || contacts.find((contact) => contactPhone(contact) === target) || null;\n",
    'whatsapp active contact',
  );

  source = replaceOnce(
    source,
    "      {error && <div className={`error ${styles.error}`}>{error}</div>}\n",
    "      {error && <div className={`error ${styles.error}`}>{error}</div>}\n      {notice && <div className={`notice ${styles.error}`}>{notice}</div>}\n",
    'whatsapp notice',
  );

  source = replaceOnce(
    source,
    "  function selectThread(thread: InboxThread) {\n",
    `  // KLYVERO_MESSAGING_DELETE_V1\n  async function deleteStoredMessage(messageId: string) {\n    if (messageId.startsWith('local-')) return;\n    const encoded = encodeURIComponent(messageId);\n    try {\n      await api(\`/inbox/messages/\${encoded}\`, { method: 'DELETE' });\n    } catch {\n      await api(\`/inbox/\${encoded}\`, { method: 'DELETE' });\n    }\n  }\n\n  async function deleteMessage(message: InboxMessage) {\n    if (deletingId) return;\n    const direction = String(message.direction || '').toUpperCase() === 'OUTBOUND' ? 'enviada' : 'recebida';\n    if (!window.confirm(\`Excluir esta mensagem \${direction}? Esta ação não pode ser desfeita.\`)) return;\n\n    setDeletingId(\`message:\${message.id}\`);\n    setError('');\n    setNotice('');\n    try {\n      await deleteStoredMessage(message.id);\n      setThreads((rows) => removeMessageFromInboxRows(rows, message.id));\n      setNotice('Mensagem excluída.');\n    } catch (cause: any) {\n      setError(cause?.message || 'Não foi possível excluir a mensagem.');\n    } finally {\n      setDeletingId('');\n    }\n  }\n\n  async function clearConversation() {\n    if (!messages.length || deletingId) return;\n    if (!window.confirm(\`Excluir todas as \${messages.length} mensagem(ns) desta conversa? O contato será mantido.\`)) return;\n\n    setDeletingId('conversation');\n    setError('');\n    setNotice('');\n    try {\n      for (const message of messages) await deleteStoredMessage(message.id);\n      const phone = target;\n      setThreads((rows) => rows.filter((row) => threadPhone(row) !== phone));\n      setSelectedId('');\n      setNotice('Conversa limpa. O contato foi mantido.');\n    } catch (cause: any) {\n      setError(cause?.message || 'Não foi possível limpar toda a conversa.');\n      await loadInbox(true);\n    } finally {\n      setDeletingId('');\n    }\n  }\n\n  async function deleteContact(contact: Contact) {\n    if (deletingId) return;\n    if (!window.confirm(\`Excluir o contato \"\${contactName(contact)}\"? As mensagens serão mantidas, mas o cadastro do contato será removido.\`)) return;\n\n    setDeletingId(\`contact:\${contact.id}\`);\n    setError('');\n    setNotice('');\n    try {\n      await api(\`/contacts/\${encodeURIComponent(contact.id)}\`, { method: 'DELETE' });\n      setContacts((rows) => rows.filter((row) => row.id !== contact.id));\n      if (selectedContactId === contact.id) setSelectedContactId('');\n      setNotice('Contato excluído. O histórico de mensagens foi preservado.');\n    } catch (cause: any) {\n      setError(cause?.message || 'Não foi possível excluir o contato.');\n    } finally {\n      setDeletingId('');\n    }\n  }\n\n  function selectThread(thread: InboxThread) {\n`,
    'whatsapp deletion handlers',
  );

  source = replaceOnce(
    source,
    "                  <button className={styles.toolButton} type=\"button\" onClick={() => void loadInbox()} aria-label=\"Atualizar\"><Icon name=\"refresh\" size={16} /></button>\n                  <button className={styles.toolButton} type=\"button\" aria-label=\"Mais opções\"><Icon name=\"more\" size={17} /></button>\n",
    "                  <button className={styles.toolButton} type=\"button\" onClick={() => void loadInbox()} aria-label=\"Atualizar\"><Icon name=\"refresh\" size={16} /></button>\n                  {messages.length > 0 && <button className={`${styles.toolButton} ${styles.dangerButton}`} type=\"button\" disabled={Boolean(deletingId)} onClick={() => void clearConversation()} aria-label=\"Limpar conversa\" title=\"Excluir todas as mensagens desta conversa\"><Icon name=\"x\" size={16} /></button>}\n                  {activeContact && <button className={`${styles.toolButton} ${styles.dangerButton}`} type=\"button\" disabled={Boolean(deletingId)} onClick={() => void deleteContact(activeContact)} aria-label=\"Excluir contato\" title=\"Excluir contato\"><Icon name=\"x\" size={16} /></button>}\n",
    'whatsapp header deletion actions',
  );

  source = replaceOnce(
    source,
    "                  return <div key={message.id} className={`${styles.bubble} ${outgoing ? styles.bubbleOut : ''}`}><div>{message.text || message.subject || '[conteúdo sem texto]'}</div><div className={styles.bubbleMeta}><span>{messageTime(message.createdAt)}</span>{outgoing && <Icon name=\"check\" size={12} />}</div></div>;\n",
    "                  return <div key={message.id} className={`${styles.bubble} ${outgoing ? styles.bubbleOut : ''}`}><div>{message.text || message.subject || '[conteúdo sem texto]'}</div><div className={styles.bubbleMeta}><span>{messageTime(message.createdAt)}</span>{outgoing && <Icon name=\"check\" size={12} />}<button className={styles.messageDelete} type=\"button\" disabled={Boolean(deletingId)} onClick={() => void deleteMessage(message)} aria-label={`Excluir mensagem ${outgoing ? 'enviada' : 'recebida'}`} title=\"Excluir mensagem\"><Icon name=\"x\" size={11} /></button></div></div>;\n",
    'whatsapp message delete control',
  );

  source = replaceOnce(
    source,
    "function mergeWhatsAppThreads(rows: InboxThread[], contacts: Contact[]) {\n",
    `function removeMessageFromInboxRows(rows: InboxThread[], messageId: string) {\n  return rows.flatMap((row) => {\n    const nested = Array.isArray(row.messages) ? row.messages : null;\n    if (nested) return [{ ...row, messages: nested.filter((message) => message.id !== messageId) }];\n    if (row.id === messageId) return [];\n    return [row];\n  });\n}\n\nfunction mergeWhatsAppThreads(rows: InboxThread[], contacts: Contact[]) {\n`,
    'whatsapp removal helper',
  );

  writeFileSync(path, source, 'utf8');
}

function patchInbox() {
  const path = join(root, 'apps', 'web', 'app', 'app', 'inbox', 'page.tsx');
  let source = readFileSync(path, 'utf8');
  if (source.includes('KLYVERO_INBOX_DELETE_V1')) return;

  source = replaceOnce(
    source,
    "  const [notice, setNotice] = useState('');\n",
    "  const [notice, setNotice] = useState('');\n  const [deletingId, setDeletingId] = useState('');\n",
    'inbox deletion state',
  );

  source = replaceOnce(
    source,
    "  return (\n    <>\n",
    `  // KLYVERO_INBOX_DELETE_V1\n  async function deleteStoredMessage(messageId: string) {\n    const encoded = encodeURIComponent(messageId);\n    try {\n      await api(\`/inbox/messages/\${encoded}\`, { method: 'DELETE' });\n    } catch {\n      await api(\`/inbox/\${encoded}\`, { method: 'DELETE' });\n    }\n  }\n\n  async function deleteMessage(item: Message) {\n    if (!selected || deletingId) return;\n    const direction = String(item.direction || '').toUpperCase() === 'OUTBOUND' ? 'enviada' : 'recebida';\n    if (!window.confirm(\`Excluir esta mensagem \${direction}? Esta ação não pode ser desfeita.\`)) return;\n\n    setDeletingId(\`message:\${item.id}\`);\n    setError('');\n    setNotice('');\n    try {\n      await deleteStoredMessage(item.id);\n      setThreads((rows) => rows.map((thread) => thread.id === selected.id ? { ...thread, messages: (thread.messages || []).filter((message) => message.id !== item.id) } : thread));\n      setNotice('Mensagem excluída.');\n    } catch (cause: any) {\n      setError(cause?.message || 'Não foi possível excluir a mensagem.');\n    } finally {\n      setDeletingId('');\n    }\n  }\n\n  async function clearConversation() {\n    if (!selected || !messages.length || deletingId) return;\n    if (!window.confirm(\`Excluir todas as \${messages.length} mensagem(ns) desta conversa?\`)) return;\n\n    setDeletingId('conversation');\n    setError('');\n    setNotice('');\n    try {\n      for (const item of messages) await deleteStoredMessage(item.id);\n      setThreads((rows) => rows.filter((thread) => thread.id !== selected.id));\n      setSelectedId('');\n      setDetailOpen(false);\n      setNotice('Conversa excluída do Inbox.');\n    } catch (cause: any) {\n      setError(cause?.message || 'Não foi possível excluir toda a conversa.');\n      await load(true);\n    } finally {\n      setDeletingId('');\n    }\n  }\n\n  return (\n    <>\n`,
    'inbox deletion handlers',
  );

  source = replaceOnce(
    source,
    "                <span className={styles.channelPill}><Icon name={channel === 'WHATSAPP' ? 'whatsapp' : 'mail'} size={14} />{channel === 'WHATSAPP' ? 'WhatsApp' : 'E-mail'}</span>\n                <button className=\"icon-btn\" type=\"button\" onClick={() => void load()} disabled={refreshing} aria-label=\"Atualizar conversa\"><Icon name=\"refresh\" size={16} /></button>\n",
    "                <span className={styles.channelPill}><Icon name={channel === 'WHATSAPP' ? 'whatsapp' : 'mail'} size={14} />{channel === 'WHATSAPP' ? 'WhatsApp' : 'E-mail'}</span>\n                {messages.length > 0 && <button className={`${styles.deleteButton} icon-btn`} type=\"button\" onClick={() => void clearConversation()} disabled={Boolean(deletingId)} aria-label=\"Excluir conversa\" title=\"Excluir todas as mensagens desta conversa\"><Icon name=\"x\" size={15} /></button>}\n                <button className=\"icon-btn\" type=\"button\" onClick={() => void load()} disabled={refreshing} aria-label=\"Atualizar conversa\"><Icon name=\"refresh\" size={16} /></button>\n",
    'inbox clear conversation action',
  );

  source = replaceOnce(
    source,
    "                        <div className={styles.meta}>{messageDate(item.createdAt)} · {outgoing ? 'Enviado' : 'Recebido'}</div>\n",
    "                        <div className={styles.meta}><span>{messageDate(item.createdAt)} · {outgoing ? 'Enviado' : 'Recebido'}</span><button className={styles.messageDelete} type=\"button\" disabled={Boolean(deletingId)} onClick={() => void deleteMessage(item)} aria-label={`Excluir mensagem ${outgoing ? 'enviada' : 'recebida'}`} title=\"Excluir mensagem\"><Icon name=\"x\" size={11} /></button></div>\n",
    'inbox message delete control',
  );

  writeFileSync(path, source, 'utf8');
}

function patchCss(relativePath, marker, rules) {
  const path = join(root, relativePath);
  let source = readFileSync(path, 'utf8');
  if (source.includes(marker)) return;
  source += `\n/* ${marker} */\n${rules}\n`;
  writeFileSync(path, source, 'utf8');
}

patchWhatsApp();
patchInbox();
patchCss(
  'apps/web/app/app/whatsapp/whatsapp.module.css',
  'KLYVERO_MESSAGING_DELETE_V1',
  `.dangerButton{color:#dc2626!important;border-color:color-mix(in srgb,#dc2626 32%,var(--ui-border))!important}.dangerButton:hover{background:color-mix(in srgb,#dc2626 9%,var(--ui-surface))!important;color:#ef4444!important}.messageDelete{width:20px;height:20px;border:0;border-radius:6px;background:transparent;color:var(--ui-subtle);display:inline-grid;place-items:center;cursor:pointer;padding:0;margin-left:2px}.messageDelete:hover{background:color-mix(in srgb,#dc2626 12%,transparent);color:#dc2626}.messageDelete:disabled,.dangerButton:disabled{opacity:.45;cursor:not-allowed}`,
);
patchCss(
  'apps/web/app/app/inbox/inbox.module.css',
  'KLYVERO_INBOX_DELETE_V1',
  `.deleteButton{color:#dc2626!important;border-color:color-mix(in srgb,#dc2626 30%,var(--ui-border))!important}.deleteButton:hover{background:color-mix(in srgb,#dc2626 9%,var(--ui-surface))!important}.meta{display:flex;align-items:center;justify-content:flex-end;gap:5px}.messageDelete{width:20px;height:20px;border:0;border-radius:6px;background:transparent;color:var(--ui-subtle);display:inline-grid;place-items:center;cursor:pointer;padding:0}.messageDelete:hover{background:color-mix(in srgb,#dc2626 12%,transparent);color:#dc2626}.messageDelete:disabled,.deleteButton:disabled{opacity:.45;cursor:not-allowed}`,
);

console.log('Messaging deletion controls patched.');
