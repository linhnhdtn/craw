import * as fs from "fs";
import * as path from "path";

const URL_COLUMN_NAMES = ["url", "loc", "link", "href", "address", "uri"];

/**
 * Read URLs from a CSV or XLSX file.
 * @param filePath  Absolute or relative path to the file.
 * @param columnName  Optional header name of the URL column.
 */
export function readUrlsFromFile(filePath: string, columnName?: string): string[] {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".csv") {
    return readCsv(filePath, columnName);
  } else if (ext === ".xlsx" || ext === ".xls") {
    return readXlsx(filePath, columnName);
  } else {
    throw new Error(
      `Unsupported file type "${ext}". Only .csv and .xlsx/.xls are supported.`
    );
  }
}

// ── Internals ────────────────────────────────────────────────────────────────

function findUrlColumn(headers: string[], preferred?: string): number {
  if (preferred) {
    const idx = headers.findIndex(
      (h) => h.trim().toLowerCase() === preferred.trim().toLowerCase()
    );
    if (idx === -1) {
      throw new Error(
        `Column "${preferred}" not found.\n` +
          `   Available headers: ${headers.map((h) => `"${h}"`).join(", ")}`
      );
    }
    return idx;
  }

  for (const name of URL_COLUMN_NAMES) {
    const idx = headers.findIndex(
      (h) => h.trim().toLowerCase() === name
    );
    if (idx !== -1) return idx;
  }

  throw new Error(
    `No URL column found automatically.\n` +
      `   Headers present: ${headers.map((h) => `"${h}"`).join(", ")}\n` +
      `   Re-run with --column=<name> to specify the correct column.`
  );
}

function isValidUrl(str: string): boolean {
  try {
    const u = new URL(str);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/** Minimal CSV row parser: handles quoted fields and "" escaped quotes. */
function parseCsvRow(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        fields.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
  }
  fields.push(current);
  return fields;
}

function readCsv(filePath: string, columnName?: string): string[] {
  const raw = fs.readFileSync(filePath, "utf-8");
  // Strip BOM if present
  const content = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;

  const lines = content.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) {
    throw new Error(`File "${filePath}" is empty.`);
  }

  const headers = parseCsvRow(lines[0]);
  const colIdx = findUrlColumn(headers, columnName);

  const urls: string[] = [];
  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvRow(lines[i]);
    const cell = (fields[colIdx] ?? "").trim();
    if (isValidUrl(cell)) urls.push(cell);
  }
  return urls;
}

function readXlsx(filePath: string, columnName?: string): string[] {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const XLSX = require("xlsx") as typeof import("xlsx");
  const wb = XLSX.readFile(filePath);
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];

  // header:1 → array of arrays; first row is headers
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 });
  if (rows.length === 0) {
    throw new Error(`File "${filePath}" is empty or has no sheet data.`);
  }

  const headers = (rows[0] as unknown[]).map((h) => String(h ?? ""));
  const colIdx = findUrlColumn(headers, columnName);

  const urls: string[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as unknown[];
    const cell = String(row[colIdx] ?? "").trim();
    if (isValidUrl(cell)) urls.push(cell);
  }
  return urls;
}
