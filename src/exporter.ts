import * as fs from "fs";
import * as path from "path";
import { PageData, CrawlError, CrawlSummary } from "./types";

/** UTF-8 BOM for Excel compatibility */
const BOM = "\uFEFF";

/** Generate a filename with a timestamp suffix to avoid overwriting old runs. */
function timestampedPath(outputDir: string, base: string, ext: string): string {
  const ts = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace("T", "_")
    .slice(0, 15); // "20260224_143022"
  return path.join(outputDir, `${base}_${ts}${ext}`);
}

/**
 * Escape a value for safe inclusion in a CSV cell.
 * Wraps in double quotes if the value contains commas, quotes, or newlines.
 * @param value - The raw cell value
 */
function escapeCsv(value: string | number | null): string {
  const str = value == null ? "" : String(value);
  if (
    str.includes('"') ||
    str.includes(",") ||
    str.includes("\n") ||
    str.includes("\r")
  ) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Convert an array of objects to a CSV string with a header row.
 * @param rows - Data rows
 * @param columns - Ordered column definitions with key and optional formatter
 */
function toCsv(
  rows: Record<string, unknown>[],
  columns: { key: string; format?: (val: unknown) => string }[]
): string {
  const header = columns.map((c) => escapeCsv(c.key)).join(",");
  const lines = rows.map((row) =>
    columns
      .map((col) => {
        const raw = row[col.key];
        const str = col.format ? col.format(raw) : String(raw ?? "");
        return escapeCsv(str);
      })
      .join(",")
  );
  return BOM + [header, ...lines].join("\n") + "\n";
}

/** Join an array with pipe separator for CSV output */
function joinArray(val: unknown): string {
  if (Array.isArray(val)) return val.join("|");
  return String(val ?? "");
}

/**
 * Column definitions for the data CSV.
 * Array fields (images, internal_links) are joined with "|".
 */
const DATA_COLUMNS: {
  key: keyof PageData & string;
  format?: (val: unknown) => string;
}[] = [
  { key: "url" },
  { key: "status_code" },
  { key: "title" },
  { key: "h1" },
  { key: "meta_description" },
  { key: "meta_keywords" },
  { key: "canonical" },
  { key: "og_image" },
  { key: "content" },
  { key: "word_count" },
  { key: "images", format: joinArray },
  { key: "images_count" },
  { key: "internal_links", format: joinArray },
  { key: "internal_links_count" },
  { key: "external_links_count" },
  { key: "json_ld" },
  { key: "price" },
  { key: "currency" },
  { key: "page_type" },
  { key: "crawled_at" },
];

const ERROR_COLUMNS: { key: keyof CrawlError & string }[] = [
  { key: "url" },
  { key: "status_code" },
  { key: "error_message" },
];

/**
 * Export crawled page data to data.csv inside the given output directory.
 * @param pages - Array of successfully crawled PageData
 * @param outputDir - Target directory (created if needed)
 * @returns Absolute path to the written file
 */
export function exportData(pages: PageData[], outputDir: string): string {
  fs.mkdirSync(outputDir, { recursive: true });
  const filePath = timestampedPath(outputDir, "data", ".csv");
  fs.writeFileSync(
    filePath,
    toCsv(pages as unknown as Record<string, unknown>[], DATA_COLUMNS),
    "utf-8"
  );
  return filePath;
}

/**
 * Export error records to errors.csv inside the given output directory.
 * @param errors - Array of CrawlError records
 * @param outputDir - Target directory (created if needed)
 * @returns Absolute path to the written file
 */
export function exportErrors(errors: CrawlError[], outputDir: string): string {
  fs.mkdirSync(outputDir, { recursive: true });
  const filePath = timestampedPath(outputDir, "errors", ".csv");
  fs.writeFileSync(
    filePath,
    toCsv(errors as unknown as Record<string, unknown>[], ERROR_COLUMNS),
    "utf-8"
  );
  return filePath;
}

/**
 * Save the raw URL list to urls.txt (one URL per line).
 * @param urls - Array of URL strings
 * @param outputDir - Target directory (created if needed)
 * @returns Absolute path to the written file
 */
export function exportUrlList(urls: string[], outputDir: string): string {
  fs.mkdirSync(outputDir, { recursive: true });
  const filePath = timestampedPath(outputDir, "urls", ".txt");
  fs.writeFileSync(filePath, urls.join("\n") + "\n", "utf-8");
  return filePath;
}

/**
 * Write crawl summary statistics to summary.json.
 * @param summary - The CrawlSummary object
 * @param outputDir - Target directory (created if needed)
 * @returns Absolute path to the written file
 */
export function exportSummary(
  summary: CrawlSummary,
  outputDir: string
): string {
  fs.mkdirSync(outputDir, { recursive: true });
  const filePath = timestampedPath(outputDir, "summary", ".json");
  fs.writeFileSync(filePath, JSON.stringify(summary, null, 2) + "\n", "utf-8");
  return filePath;
}
