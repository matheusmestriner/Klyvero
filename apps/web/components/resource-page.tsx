'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { CsvColumn, csvDateStamp, downloadCsv, parseCsvFile, resolveCsvValue } from '../lib/csv';

export type Field = {
  key: string;
  label: string;
  type?: 'text' | 'email' | 'number' | 'textarea' | 'select' | 'datetime';
  options?: string[];
  required?: boolean;
};

type ImportFailure = { line: number; message: string };
type ImportResult = { imported: number; failed: ImportFailure[] };

export function ResourcePage({
  title,
  path,
  singular,
  fields,
}: {
  title: string;
  path: string;
  singular: string;
  fields: Field[];
}) {
  const [rows, setRows] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const csvColumns = useMemo<CsvColumn[]>(
    () => fields.map((field) => ({ key: field.key, label: field.label })),
    [fields],
  );

  const fileBase = useMemo(
    () => title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    [title],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const payload = await api(path);
      const data = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.items)
          ? payload.items
          : Array.isArray(payload?.data)
            ? payload.data
            : [];
      setRows(data);
    } catch (loadError: any) {
      setRows([]);
      setError(loadError?.message || `Não foi possível carregar ${title.toLowerCase()}.`);
    } finally {
      setLoading(false);
    }
  }, [path, title]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setNotice('');
    const form = new FormData(event.currentTarget);
    const body: Record<string, unknown> = {};

    for (const field of fields) {
      const value = form.get(field.key);
      if (value !== null && value !== '') {
        body[field.key] = field.type === 'number' ? Number(value) : value;
      }
    }

    try {
      await api(path, { method: 'POST', body: JSON.stringify(body) });
      setShowCreate(false);
      setNotice(`${capitalize(singular)} cadastrado com sucesso.`);
      await load();
    } catch (submitError: any) {
      setError(submitError?.message || `Não foi possível cadastrar ${singular}.`);
    }
  }

  function exportRows() {
    downloadCsv(`klyvero-${fileBase}-${csvDateStamp()}.csv`, rows, csvColumns);
    setNotice(`${rows.length} registro(s) exportado(s) em CSV.`);
  }

  function exportTemplate() {
    downloadCsv(`modelo-${fileBase}.csv`, [], csvColumns);
  }

  function closeImport() {
    if (importing) return;
    setShowImport(false);
    setImportFile(null);
    setImportResult(null);
  }

  async function importRows() {
    if (!importFile || importing) return;
    setImporting(true);
    setError('');
    setNotice('');
    setImportResult(null);

    try {
      const parsed = parseCsvFile(await importFile.text());
      if (!parsed.rows.length) throw new Error('O CSV não contém registros para importar.');

      const failures: ImportFailure[] = [];
      let imported = 0;

      for (let index = 0; index < parsed.rows.length; index += 1) {
        const sourceRow = parsed.rows[index];
        const body: Record<string, unknown> = {};
        let invalid = '';

        for (const field of fields) {
          const value = resolveCsvValue(sourceRow, { key: field.key, label: field.label });

          if (field.required && !value) {
            invalid = `Campo obrigatório ausente: ${field.label}.`;
            break;
          }

          if (!value) continue;

          if (field.type === 'number') {
            const normalized = value.replace(',', '.');
            const numberValue = Number(normalized);
            if (!Number.isFinite(numberValue)) {
              invalid = `${field.label} precisa ser numérico.`;
              break;
            }
            body[field.key] = numberValue;
          } else if (field.type === 'select' && field.options?.length && !field.options.includes(value)) {
            invalid = `${field.label} possui um valor inválido.`;
            break;
          } else {
            body[field.key] = value;
          }
        }

        if (invalid) {
          failures.push({ line: index + 2, message: invalid });
          continue;
        }

        if (!Object.keys(body).length) {
          failures.push({ line: index + 2, message: 'Linha sem dados reconhecidos.' });
          continue;
        }

        try {
          await api(path, { method: 'POST', body: JSON.stringify(body) });
          imported += 1;
        } catch (rowError: any) {
          failures.push({ line: index + 2, message: rowError?.message || 'Falha ao cadastrar registro.' });
        }
      }

      setImportResult({ imported, failed: failures });
      if (imported > 0) {
        setNotice(`${imported} registro(s) importado(s) com sucesso.`);
        await load();
      }
    } catch (importError: any) {
      setError(importError?.message || 'Não foi possível importar o CSV.');
    } finally {
      setImporting(false);
    }
  }

  return (
    <>
      <PageTitle
        title={title}
        action={
          <div className="page-actions data-transfer-actions">
            <button className="btn ghost" type="button" onClick={() => { setShowImport(true); setImportResult(null); setError(''); }}>
              Importar
            </button>
            <button className="btn ghost" type="button" onClick={exportRows}>
              Exportar
            </button>
            <button className="btn primary" type="button" onClick={() => setShowCreate(true)}>
              Novo {singular}
            </button>
          </div>
        }
      />

      {error && <div className="error">{error}</div>}
      {notice && <div className="notice">{notice}</div>}

      <div className="card table-card">
        <table className="table">
          <thead>
            <tr>{fields.slice(0, 5).map((field) => <th key={field.key}>{field.label}</th>)}</tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="empty">Carregando…</td></tr>
            ) : rows.length ? rows.map((row, index) => (
              <tr key={row.id || index}>
                {fields.slice(0, 5).map((field) => <td key={field.key}>{format(row[field.key])}</td>)}
              </tr>
            )) : (
              <tr><td colSpan={5} className="empty">Nenhum registro.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <div className="modalback">
          <form className="modal" onSubmit={submit}>
            <div className="modalhead">
              <h3>Novo {singular}</h3>
              <button type="button" className="btn ghost" onClick={() => setShowCreate(false)}>Fechar</button>
            </div>
            <div className="form-grid">
              {fields.map((field) => (
                <div className="field" key={field.key}>
                  <label>{field.label}</label>
                  {field.type === 'textarea' ? (
                    <textarea name={field.key} rows={5} required={field.required} />
                  ) : field.type === 'select' ? (
                    <select name={field.key} required={field.required}>
                      {field.options?.map((option) => <option key={option}>{option}</option>)}
                    </select>
                  ) : (
                    <input name={field.key} type={field.type === 'datetime' ? 'datetime-local' : field.type || 'text'} required={field.required} />
                  )}
                </div>
              ))}
            </div>
            <button className="btn primary spaced">Salvar</button>
          </form>
        </div>
      )}

      {showImport && (
        <div className="modalback" onMouseDown={(event) => event.target === event.currentTarget && closeImport()}>
          <div className="modal data-transfer-modal" role="dialog" aria-modal="true" aria-labelledby="resource-import-title">
            <div className="modalhead">
              <div>
                <h3 id="resource-import-title">Importar {title.toLowerCase()}</h3>
                <p className="muted">CSV UTF-8, separado por vírgula ou ponto e vírgula. Máximo de 500 registros e 2 MB.</p>
              </div>
              <button type="button" className="btn ghost" onClick={closeImport} disabled={importing}>Fechar</button>
            </div>

            <div className="import-help">
              <strong>Colunas aceitas</strong>
              <span>{fields.map((field) => field.label).join(' · ')}</span>
              <button type="button" className="btn ghost compact" onClick={exportTemplate}>Baixar modelo CSV</button>
            </div>

            <label className="csv-dropzone">
              <span>{importFile ? importFile.name : 'Selecionar arquivo CSV'}</span>
              <small>{importFile ? `${Math.max(1, Math.round(importFile.size / 1024))} KB` : 'Clique para escolher o arquivo no computador.'}</small>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(event) => {
                  setImportFile(event.target.files?.[0] ?? null);
                  setImportResult(null);
                }}
                disabled={importing}
              />
            </label>

            {importResult && (
              <div className={`import-result ${importResult.failed.length ? 'with-errors' : 'success'}`}>
                <strong>{importResult.imported} importado(s)</strong>
                <span>{importResult.failed.length} linha(s) com erro.</span>
                {importResult.failed.length > 0 && (
                  <ul>
                    {importResult.failed.slice(0, 8).map((failure) => (
                      <li key={`${failure.line}-${failure.message}`}>Linha {failure.line}: {failure.message}</li>
                    ))}
                    {importResult.failed.length > 8 && <li>Mais {importResult.failed.length - 8} erro(s) não exibido(s).</li>}
                  </ul>
                )}
              </div>
            )}

            <div className="data-transfer-footer">
              <button type="button" className="btn ghost" onClick={closeImport} disabled={importing}>Cancelar</button>
              <button type="button" className="btn primary" onClick={importRows} disabled={!importFile || importing}>
                {importing ? 'Importando…' : 'Importar registros'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function format(value: any) {
  if (value == null || value === '') return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function capitalize(value: string) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

export function PageTitle({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
