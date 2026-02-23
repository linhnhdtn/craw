# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Sitemap Crawler — a TypeScript CLI tool that parses a sitemap XML, crawls every page, extracts structured SEO/content/e-commerce data, and exports to CSV. Designed for e-commerce sites (e.g. artcrystal.eu) where sitemaps only contain URL lists.

## Commands

```bash
npm install           # Install dependencies
npm run build         # Compile TypeScript (tsc) to dist/
npm run dev           # Run via tsx (no build step)
npm start             # Run compiled dist/index.js

# Example
npm run dev -- --url="https://example.com/sitemap.xml" --filter="/a/" --concurrency=10
```

No tests or linting are configured.

### CLI Arguments

| Argument | Default | Description |
|---|---|---|
| `--url` | (interactive prompt) | Sitemap URL |
| `--filter` | none | Regex pattern to filter URLs |
| `--concurrency` | 5 | Parallel requests per batch |
| `--delay` | 500 | Delay in ms between batches |
| `--timeout` | 15000 | Request timeout in ms |
| `--output` | `./output` | Output directory |

## Architecture

Three-step pipeline: **parse sitemap → crawl pages → export files**.

- **src/index.ts** — Entry point. Parses CLI args, falls back to interactive prompt via readline. Orchestrates the 3 steps, prints progress per URL, prints summary.
- **src/sitemap-parser.ts** — Fetches sitemap XML via axios, parses with `fast-xml-parser`. Recursively handles sitemap index files (`<sitemapindex>` → child `<sitemap><loc>`). Also provides `filterUrls()` for regex filtering.
- **src/crawler.ts** — `crawlPage(url, http)` fetches HTML and uses cheerio to extract 20 fields: SEO meta tags, content (smart selector cascade: `main` → `article` → `.main-content` → `.content` → `#content` → `.page-content` → `body`), images as absolute URLs, internal/external links, JSON-LD structured data, price/currency from JSON-LD or HTML microdata, page type classification by URL pattern + JSON-LD `@type`. Returns discriminated union `CrawlResult`.
- **src/exporter.ts** — Writes 4 output files to `outputDir`: `data.csv` (UTF-8 BOM, array fields joined with `|`), `errors.csv`, `urls.txt`, `summary.json`. Manual CSV escaping handles commas/quotes/newlines.
- **src/utils.ts** — `createHttpClient(timeout)` factory with UA rotation (3 browsers) via axios interceptor, `withRetry` (1 retry, 1s backoff), `runInBatches` (concurrency + delay + per-item progress callback), `deduplicateUrls` (trailing-slash normalization), error extraction helpers, `formatDuration`.
- **src/types.ts** — Interfaces: `CrawlConfig`, `PageData` (20 fields), `CrawlError`, `CrawlSummary`, `CrawlResult` discriminated union.

## Key Patterns

- TypeScript compiles to ES2022/commonjs (`strict: true`, output to `dist/`)
- HTTP client is created once with configurable timeout and passed through as dependency (not a global singleton)
- User-Agent rotates randomly per request via axios interceptor
- Error handling uses discriminated unions — crawl errors never crash the process, they're collected and exported separately
- Page type classification: URL regex patterns checked first (`/a/{id}/` → article, `/c/` → category, `/p/` → product, `gallery` → gallery), then JSON-LD `@type` as fallback
- Content extraction tries semantic selectors before falling back to `<body>`, truncated to 2000 chars
- Price extraction tries JSON-LD Product.offers first, then HTML microdata (`[itemprop="price"]`), then CSS selectors (`.price`, `.product-price`)

## Key Dependencies

- **axios** — HTTP client (timeout, redirects, UA rotation)
- **cheerio** — HTML parsing / DOM queries
- **fast-xml-parser** — Sitemap XML parsing
- **tsx** — Dev-time TypeScript runner
