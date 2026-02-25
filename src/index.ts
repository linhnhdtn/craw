import * as readline from "readline";
import * as path from "path";
import { CrawlConfig, PageData, CrawlError, CrawlResult, CrawlSummary } from "./core/types";
import { parseSitemap, filterUrls } from "./core/sitemap-parser";
import { readUrlsFromFile } from "./core/file-reader";
import { crawlPage } from "./core/crawler";
import { crawlProduct } from "./product/crawler";
import { crawlArticle } from "./article/crawler";
import { exportArticlesJson, exportArticlesHtml } from "./article/exporter";
import { ArticleData } from "./article/types";
import {
  exportData,
  exportErrors,
  exportUrlList,
  exportSummary,
} from "./core/exporter";
import { exportProductsJson, exportProductsCsv } from "./product/exporter";
import { ProductScrapeResult } from "./product/types";
import {
  createHttpClient,
  deduplicateUrls,
  runInBatches,
  formatDuration,
} from "./core/utils";

/**
 * Parse CLI arguments into a CrawlConfig.
 * Supports --url, --filter, --concurrency, --delay, --timeout, --output.
 */
function parseArgs(): Partial<CrawlConfig> & { sitemapUrl?: string; inputFile?: string; urlColumn?: string } {
  const args = process.argv.slice(2);
  const opts: Record<string, string> = {};
  let mode: CrawlConfig["mode"] = "default";

  for (const arg of args) {
    if (arg === "-p") { mode = "product"; continue; }
    if (arg === "-cms") { mode = "cms"; continue; }
    if (arg === "-a") { mode = "article"; continue; }
    const eqIdx = arg.indexOf("=");
    if (arg.startsWith("--") && eqIdx !== -1) {
      const key = arg.slice(2, eqIdx);
      const value = arg.slice(eqIdx + 1);
      opts[key] = value;
    }
  }

  return {
    sitemapUrl: opts.url,
    inputFile: opts.input,
    urlColumn: opts.column,
    mode,
    filter: opts.filter ? new RegExp(opts.filter) : null,
    concurrency: opts.concurrency ? parseInt(opts.concurrency, 10) : undefined,
    delayMs: opts.delay ? parseInt(opts.delay, 10) : undefined,
    timeout: opts.timeout ? parseInt(opts.timeout, 10) : undefined,
    outputDir: opts.output,
  };
}

/**
 * Prompt the user interactively for a sitemap URL via stdin.
 */
function promptForUrl(): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question("Enter sitemap URL: ", (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main(): Promise<void> {
  const args = parseArgs();

  const usingFile = Boolean(args.inputFile);
  const sitemapUrl = usingFile ? args.inputFile! : (args.sitemapUrl || (await promptForUrl()));

  if (!usingFile && !sitemapUrl) {
    console.error("Error: No sitemap URL provided.");
    process.exit(1);
  }

  const runTs = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace("T", "_")
    .slice(0, 15); // "20260224_143022"

  const baseOutputDir = path.resolve(args.outputDir || "./output");
  const runDir = path.join(baseOutputDir, runTs);

  const config: CrawlConfig = {
    sitemapUrl,
    mode: args.mode ?? "default",
    filter: args.filter ?? null,
    concurrency: args.concurrency || 5,
    delayMs: args.delayMs ?? 500,
    timeout: args.timeout || 15_000,
    outputDir: runDir,
  };

  const modeLabel: Record<CrawlConfig["mode"], string> = {
    product: "Product (-p)",
    cms: "CMS (-cms)",
    article: "Article (-a)",
    default: "Default",
  };
  console.log(`Sitemap Crawler v1.0  [Mode: ${modeLabel[config.mode]}]\n`);

  const http = createHttpClient(config.timeout);

  // ── Step 1: Load URLs ─────────────────────────────────────────────
  let rawUrls: string[];

  if (usingFile) {
    console.log(`Step 1: Reading URLs from file: ${args.inputFile}...`);
    try {
      rawUrls = readUrlsFromFile(args.inputFile!, args.urlColumn);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`\n   Error: ${msg}`);
      process.exit(1);
    }
  } else {
    console.log("Step 1: Parsing sitemap...");
    try {
      rawUrls = await parseSitemap(config.sitemapUrl, http);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`\n   Error: Could not fetch sitemap at ${config.sitemapUrl}`);
      console.error(`   ${msg}`);
      process.exit(1);
    }
  }

  const totalInSitemap = rawUrls.length;
  console.log(`   Found ${totalInSitemap} URLs`);

  const dedupedUrls = deduplicateUrls(rawUrls);
  const totalAfterDedup = dedupedUrls.length;
  if (totalAfterDedup < totalInSitemap) {
    console.log(`   After dedup: ${totalAfterDedup} unique URLs`);
  }

  let urls = dedupedUrls;
  let totalAfterFilter = totalAfterDedup;

  if (config.filter) {
    urls = filterUrls(urls, config.filter);
    totalAfterFilter = urls.length;
    console.log(
      `   After filter (${config.filter.source}): ${totalAfterFilter} URLs`
    );
  }

  const urlListPath = exportUrlList(urls, config.outputDir);
  console.log(`   URL list saved to ${urlListPath}\n`);

  if (urls.length === 0) {
    console.log("Nothing to crawl. Exiting.");
    return;
  }

  // ── Product mode (-p) ─────────────────────────────────────────────
  if (config.mode === "product") {
    console.log(
      `Step 2: Crawling ${urls.length} product pages (concurrency: ${config.concurrency})...`
    );
    const startTime = Date.now();

    const productResults = await runInBatches(
      urls,
      config.concurrency,
      config.delayMs,
      (url) => crawlProduct(url, http),
      (completed, total, url, result) => {
        const icon = result.success ? "+" : "x";
        console.log(`   [${completed}/${total}]  ${icon} ${url}`);
      }
    );

    const elapsed = Date.now() - startTime;
    const successes = productResults
      .filter((r) => r.success)
      .map((r) => (r as { success: true; data: ProductScrapeResult }).data);
    const failures = productResults.filter((r) => !r.success) as {
      success: false;
      url: string;
      error: string;
    }[];

    console.log("\nStep 3: Exporting...");
    const jsonPath = exportProductsJson(successes, config.outputDir);
    const csvPath = exportProductsCsv(successes, config.outputDir);
    console.log(`   ${jsonPath} (${successes.length} products)`);
    console.log(`   ${csvPath} (${successes.length} products)`);

    if (failures.length > 0) {
      console.log(`\n   Failed URLs (${failures.length}):`);
      for (const f of failures) {
        console.log(`     x ${f.url}: ${f.error}`);
      }
    }

    console.log(`\nDone in ${formatDuration(elapsed)}`);
    console.log(`   Success: ${successes.length}/${urls.length}`);
    console.log(`   Errors:  ${failures.length}/${urls.length}`);
    console.log(`   Output:  ${config.outputDir}/`);
    return;
  }

  // ── Article mode (-a) ─────────────────────────────────────────────
  if (config.mode === "article") {
    console.log(
      `Step 2: Crawling ${urls.length} article pages (concurrency: ${config.concurrency})...`
    );
    const startTime = Date.now();

    const articleResults = await runInBatches(
      urls,
      config.concurrency,
      config.delayMs,
      (url) => crawlArticle(url, http),
      (completed, total, url, result) => {
        const icon = result.success ? "+" : "x";
        console.log(`   [${completed}/${total}]  ${icon} ${url}`);
      }
    );

    const elapsed = Date.now() - startTime;
    const successes = articleResults
      .filter((r) => r.success)
      .map((r) => (r as { success: true; data: ArticleData }).data);
    const failures = articleResults.filter((r) => !r.success) as {
      success: false;
      url: string;
      error: string;
    }[];

    console.log("\nStep 3: Exporting...");
    const jsonPath = exportArticlesJson(successes, config.outputDir);
    console.log(`   ${jsonPath} (${successes.length} articles)`);

    const htmlPaths = exportArticlesHtml(successes, config.outputDir);
    for (const p of htmlPaths) {
      console.log(`   ${p}`);
    }

    if (failures.length > 0) {
      console.log(`\n   Failed URLs (${failures.length}):`);
      for (const f of failures) {
        console.log(`     x ${f.url}: ${f.error}`);
      }
    }

    console.log(`\nDone in ${formatDuration(elapsed)}`);
    console.log(`   Success: ${successes.length}/${urls.length}`);
    console.log(`   Errors:  ${failures.length}/${urls.length}`);
    console.log(`   Output:  ${config.outputDir}/`);
    return;
  }

  // ── Step 2: Crawl pages ───────────────────────────────────────────
  console.log(
    `Step 2: Crawling ${urls.length} pages (concurrency: ${config.concurrency})...`
  );

  const startTime = Date.now();

  const results: CrawlResult[] = await runInBatches(
    urls,
    config.concurrency,
    config.delayMs,
    (url) => crawlPage(url, http),
    (completed, total, url, result) => {
      const icon = result.success ? "+" : "x";
      const status = result.success
        ? result.data.status_code
        : result.error.status_code ?? "ERR";
      console.log(`   [${completed}/${total}]  ${icon} ${status} ${url}`);
    }
  );

  const elapsed = Date.now() - startTime;

  // Separate successes and errors
  const pages: PageData[] = [];
  const errors: CrawlError[] = [];
  for (const r of results) {
    if (r.success) pages.push(r.data);
    else errors.push(r.error);
  }

  // ── Step 3: Export ────────────────────────────────────────────────
  console.log("\nStep 3: Exporting...");

  const outputFiles: string[] = [];

  const dataPath = exportData(pages, config.outputDir);
  outputFiles.push(dataPath);
  console.log(`   ${dataPath} (${pages.length} rows)`);

  if (errors.length > 0) {
    const errPath = exportErrors(errors, config.outputDir);
    outputFiles.push(errPath);
    console.log(`   ${errPath} (${errors.length} rows)`);
  }

  outputFiles.push(urlListPath);
  console.log(`   ${urlListPath} (${urls.length} URLs)`);

  const successRate =
    urls.length > 0
      ? ((pages.length / urls.length) * 100).toFixed(1) + "%"
      : "0%";

  const summary: CrawlSummary = {
    sitemap_url: config.sitemapUrl,
    total_urls_in_sitemap: totalInSitemap,
    total_urls_after_dedup: totalAfterDedup,
    total_urls_after_filter: totalAfterFilter,
    total_crawled: urls.length,
    total_success: pages.length,
    total_errors: errors.length,
    success_rate: successRate,
    elapsed_time: formatDuration(elapsed),
    output_files: outputFiles,
    crawled_at: new Date().toISOString(),
  };

  const summaryPath = exportSummary(summary, config.outputDir);
  outputFiles.push(summaryPath);
  console.log(`   ${summaryPath}`);

  // ── Done ──────────────────────────────────────────────────────────
  console.log(`\nDone in ${formatDuration(elapsed)}`);
  console.log(
    `   Success: ${pages.length}/${urls.length} (${successRate})`
  );
  console.log(`   Errors:  ${errors.length}/${urls.length}`);
  console.log(`   Output:  ${config.outputDir}/`);
}

main();
