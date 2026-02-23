# Sitemap Crawler

CLI tool that crawls website data through a sitemap URL and exports structured results to CSV.

## Setup

```bash
npm install
```

## Usage

```bash
# Run with a sitemap URL
npm run dev -- --url="https://example.com/sitemap.xml"

# Filter URLs by regex (e.g. only article pages)
npm run dev -- --url="https://example.com/sitemap.xml" --filter="/a/"

# Custom concurrency and delay
npm run dev -- --url="https://example.com/sitemap.xml" --concurrency=10 --delay=300

# Custom timeout (ms) and output directory
npm run dev -- --url="https://example.com/sitemap.xml" --timeout=20000 --output=./results

# If no --url provided, you'll be prompted interactively
npm run dev
```

### CLI Arguments

| Argument | Default | Description |
|---|---|---|
| `--url` | (prompt) | Sitemap URL |
| `--filter` | none | Regex pattern to filter URLs |
| `--concurrency` | 5 | Parallel requests per batch |
| `--delay` | 500 | Delay in ms between batches |
| `--timeout` | 15000 | Request timeout in ms |
| `--output` | `./output` | Output directory |

## Output Files

| File | Description |
|---|---|
| `output/data.csv` | All successfully crawled pages with extracted data |
| `output/errors.csv` | Failed URLs with error details (only if errors exist) |
| `output/urls.txt` | Raw URL list extracted from sitemap |
| `output/summary.json` | Crawl statistics (counts, success rate, elapsed time) |

### Extracted Fields (data.csv)

| Field | Description |
|---|---|
| `url` | Page URL |
| `status_code` | HTTP status code |
| `title` | `<title>` tag content |
| `h1` | First `<h1>` text |
| `meta_description` | `<meta name="description">` content |
| `meta_keywords` | `<meta name="keywords">` content |
| `canonical` | `<link rel="canonical">` href |
| `og_image` | `<meta property="og:image">` content |
| `content` | Body text (max 2000 chars, stripped of HTML/scripts/nav) |
| `word_count` | Word count of full body text |
| `images` | All `<img>` src URLs (joined with `\|`) |
| `images_count` | Number of images |
| `internal_links` | Internal link hrefs (joined with `\|`) |
| `internal_links_count` | Number of internal links |
| `external_links_count` | Number of external links |
| `json_ld` | JSON-LD structured data (stringified) |
| `price` | Product price (from JSON-LD or HTML selectors) |
| `currency` | Currency code |
| `page_type` | `article`, `category`, `product`, `gallery`, or `page` |
| `crawled_at` | ISO timestamp |

## Build

```bash
npm run build   # Compile TypeScript to dist/
npm start       # Run compiled version
```
