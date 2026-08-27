import type { AdapterError } from "../errors.js";

export interface CsvOptions {
  /** When true, coerce numeric and boolean strings to native types. */
  inferTypes?: boolean;
}

export type ParseCsvResult =
  | { ok: true; records: Record<string, unknown>[] }
  | { ok: false; error: AdapterError };

/**
 * Parse CSV text into an array of records.
 *
 * Supports: quoted fields with embedded commas/newlines, escaped `""`,
 * CRLF and LF line endings, a trailing newline, and empty input.
 * Ragged rows and unterminated quoted fields produce a structured error.
 */
export function parseCsv(input: string, options: CsvOptions = {}): ParseCsvResult {
  const rowsResult = tokenize(input);
  if (!rowsResult.ok) return rowsResult;
  const rows = rowsResult.rows;

  if (rows.length === 0) return { ok: true, records: [] };

  const header = rows[0]!;
  const records: Record<string, unknown>[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]!;
    if (row.length !== header.length) {
      return {
        ok: false,
        error: {
          code: "INVALID_CSV",
          message: `Row ${i + 1} has ${row.length} field(s); expected ${header.length}.`,
          line: i + 1
        }
      };
    }
    const record: Record<string, unknown> = {};
    for (let c = 0; c < header.length; c++) {
      const key = header[c]!;
      const raw = row[c]!;
      record[key] = options.inferTypes ? coerce(raw) : raw;
    }
    records.push(record);
  }

  return { ok: true, records };
}

type TokenizeResult =
  | { ok: true; rows: string[][] }
  | { ok: false; error: AdapterError };

function tokenize(input: string): TokenizeResult {
  if (input.length === 0) return { ok: true, rows: [] };

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let line = 1;
  let rowStartLine = 1;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];

    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        if (ch === "\n") line++;
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }

    if (ch === ",") {
      row.push(field);
      field = "";
      continue;
    }

    if (ch === "\r") {
      if (input[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      field = "";
      row = [];
      line++;
      rowStartLine = line;
      continue;
    }

    if (ch === "\n") {
      row.push(field);
      rows.push(row);
      field = "";
      row = [];
      line++;
      rowStartLine = line;
      continue;
    }

    field += ch;
  }

  if (inQuotes) {
    return {
      ok: false,
      error: {
        code: "INVALID_CSV",
        message: "Unterminated quoted field.",
        line: rowStartLine
      }
    };
  }

  // Flush trailing field/row unless input ended on a newline (which already
  // pushed an empty trailing record we don't want).
  const lastChar = input[input.length - 1];
  const endedOnNewline = lastChar === "\n" || lastChar === "\r";
  if (!endedOnNewline) {
    row.push(field);
    rows.push(row);
  }

  return { ok: true, rows };
}

const INTEGER = /^-?\d+$/;
const FLOAT = /^-?\d+\.\d+$/;

function coerce(value: string): unknown {
  if (value === "") return "";
  const lower = value.toLowerCase();
  if (lower === "true") return true;
  if (lower === "false") return false;
  if (INTEGER.test(value) || FLOAT.test(value)) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return value;
}
