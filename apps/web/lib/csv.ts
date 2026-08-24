export type CsvColumn = {
  key: string;
  label: string;
  aliases?: string[];
};

export type ParsedCsv = {
  headers: string[];
  rows: Record<string, string>[];
};

const MAX_CSV_BYTES = 2 * 1024 * 1024;
const MAX_CSV_ROWS = 500;

export function normalizeCsvHeader(value: string) {
  return value
    .replace(/^\uFEFF/, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

export function parseCsvFile(text: string): ParsedCsv {
  if (new TextEncoder().encode(text).byteLength > MAX_CSV_BYTES) {
    throw new Error('O arquivo CSV deve ter no máximo 2 MB.');
  }

  const delimiter = detectDelimiter(text);
  const records = parseDelimited(text, delimiter)
    .map((row) => row.map((cell) => cell.trim()))
    .filter((row) => row.some(Boolean));

  if (!records.length) throw new Error('O arquivo CSV está vazio.');

  const headers = records[0].map((header) => header.replace(/^\uFEFF/, '').trim());
  if (!headers.some(Boolean)) throw new Error('O CSV precisa conter um cabeçalho.');

  const body = records.slice(1);
  if (body.length > MAX_CSV_ROWS) {
    throw new Error(`Importe no máximo ${MAX_CSV_ROWS} registros por arquivo.`);
  }

  const rows = body.map((record) => {
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = record[index] ?? '';
    });
    return row;
  });

  return { headers, rows };
}

export function resolveCsvValue(
  row: Record<string, string>,
  column: CsvColumn,
) {
  const accepted = [column.key, column.label, ...(column.aliases ?? [])].map(normalizeCsvHeader);
  for (const [header, value] of Object.entries(row)) {
    if (accepted.includes(normalizeCsvHeader(header))) return value.trim();
  }
  return '';
}

export function downloadCsv(
  filename: string,
  rows: Record<string, unknown>[],
  columns: CsvColumn[],
) {
  const delimiter = ';';
  const header = columns.map((column) => escapeCsv(column.label, delimiter)).join(delimiter);
  const body = rows.map((row) =>
    columns
      .map((column) => escapeCsv(formatCsvValue(row[column.key]), delimiter))
      .join(delimiter),
  );

  const content = `\uFEFF${[header, ...body].join('\r\n')}`;
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function csvDateStamp() {
  return new Date().toISOString().slice(0, 10);
}

function formatCsvValue(value: unknown) {
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function escapeCsv(value: string, delimiter: string) {
  let safe = value;
  // Neutralize spreadsheet formula injection when exported data is opened in Excel/Sheets.
  if (/^[=+\-@]/.test(safe)) safe = `'${safe}`;
  if (safe.includes('"')) safe = safe.replace(/"/g, '""');
  if (safe.includes(delimiter) || safe.includes('\n') || safe.includes('\r') || safe.includes('"')) {
    return `"${safe}"`;
  }
  return safe;
}

function detectDelimiter(text: string) {
  const firstLine = firstLogicalLine(text);
  const semicolons = countOutsideQuotes(firstLine, ';');
  const commas = countOutsideQuotes(firstLine, ',');
  return semicolons >= commas ? ';' : ',';
}

function firstLogicalLine(text: string) {
  let quoted = false;
  let line = '';
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        line += '""';
        index += 1;
        continue;
      }
      quoted = !quoted;
    }
    if (!quoted && (char === '\n' || char === '\r')) break;
    line += char;
  }
  return line;
}

function countOutsideQuotes(value: string, target: string) {
  let quoted = false;
  let count = 0;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === '"') {
      if (quoted && value[index + 1] === '"') {
        index += 1;
        continue;
      }
      quoted = !quoted;
    } else if (!quoted && char === target) {
      count += 1;
    }
  }
  return count;
}

function parseDelimited(text: string, delimiter: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (!quoted && char === delimiter) {
      row.push(cell);
      cell = '';
      continue;
    }

    if (!quoted && (char === '\n' || char === '\r')) {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      continue;
    }

    cell += char;
  }

  row.push(cell);
  rows.push(row);
  return rows;
}
