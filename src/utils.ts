import axios, { AxiosError, AxiosInstance } from "axios";

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0",
];

/**
 * Pick a random User-Agent string from the rotation pool.
 */
function randomUA(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/**
 * Create a configured axios instance with realistic browser headers.
 * @param timeout - Request timeout in milliseconds
 */
export function createHttpClient(timeout: number): AxiosInstance {
  const client = axios.create({
    timeout,
    headers: {
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Accept-Encoding": "gzip, deflate, br",
    },
    maxRedirects: 5,
  });

  // Rotate User-Agent on every request
  client.interceptors.request.use((config) => {
    config.headers["User-Agent"] = randomUA();
    return config;
  });

  return client;
}

/**
 * Sleep for the given number of milliseconds.
 * @param ms - Milliseconds to wait
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute an async function with a single retry using exponential backoff.
 * Waits 1 second before the retry attempt.
 * @param fn - The async function to execute
 * @returns The result of the function
 */
export async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (firstError) {
    await sleep(1000);
    try {
      return await fn();
    } catch {
      throw firstError;
    }
  }
}

/**
 * Process items in batches with configurable concurrency and delay.
 * @param items - Array of items to process
 * @param concurrency - Max items to process in parallel per batch
 * @param delayMs - Milliseconds to wait between batches
 * @param processor - Async function to run on each item
 * @param onItemDone - Callback after each item completes
 * @returns Array of results in input order
 */
export async function runInBatches<T, R>(
  items: T[],
  concurrency: number,
  delayMs: number,
  processor: (item: T) => Promise<R>,
  onItemDone: (completed: number, total: number, item: T, result: R) => void
): Promise<R[]> {
  const results: R[] = [];
  let completed = 0;

  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(async (item) => {
        const result = await processor(item);
        completed++;
        onItemDone(completed, items.length, item, result);
        return result;
      })
    );
    results.push(...batchResults);

    if (i + concurrency < items.length) {
      await sleep(delayMs);
    }
  }

  return results;
}

/**
 * Deduplicate an array of URL strings, preserving order of first occurrence.
 * @param urls - Array of URLs (may contain duplicates)
 * @returns Deduplicated array
 */
export function deduplicateUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const url of urls) {
    const normalized = url.replace(/\/$/, "");
    if (!seen.has(normalized)) {
      seen.add(normalized);
      unique.push(url);
    }
  }
  return unique;
}

/**
 * Extract a human-readable error message from an unknown error.
 * @param err - The caught error
 */
export function getErrorMessage(err: unknown): string {
  if (err instanceof AxiosError) {
    if (err.code === "ECONNABORTED") return "Request timed out";
    if (err.code === "ENOTFOUND")
      return `DNS lookup failed: ${err.config?.url ?? "unknown host"}`;
    if (err.code === "ERR_TLS_CERT_ALTNAME_INVALID")
      return "SSL certificate error";
    if (err.code === "ECONNRESET") return "Connection reset by server";
    if (err.code === "ECONNREFUSED") return "Connection refused";
    if (err.response)
      return `HTTP ${err.response.status}: ${err.response.statusText}`;
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * Extract the HTTP status code from an error, if available.
 * @param err - The caught error
 */
export function getErrorStatus(err: unknown): number | null {
  if (err instanceof AxiosError && err.response) {
    return err.response.status;
  }
  return null;
}

/**
 * Format a duration in milliseconds to a human-readable string like "2m 30s".
 * @param ms - Duration in milliseconds
 */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}
