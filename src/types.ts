/** CLI configuration parsed from command-line arguments */
export interface CrawlConfig {
  sitemapUrl: string;
  filter: RegExp | null;
  concurrency: number;
  delayMs: number;
  timeout: number;
  outputDir: string;
}

/** Data extracted from a single successfully crawled page */
export interface PageData {
  url: string;
  status_code: number;
  title: string;
  h1: string;
  meta_description: string;
  meta_keywords: string;
  canonical: string;
  og_image: string;
  content: string;
  word_count: number;
  images: string[];
  images_count: number;
  internal_links: string[];
  internal_links_count: number;
  external_links_count: number;
  json_ld: string;
  price: string;
  currency: string;
  page_type: "article" | "category" | "product" | "gallery" | "page";
  crawled_at: string;
}

/** Record for a URL that failed to crawl */
export interface CrawlError {
  url: string;
  status_code: number | null;
  error_message: string;
}

/** Statistics written to summary.json after a crawl completes */
export interface CrawlSummary {
  sitemap_url: string;
  total_urls_in_sitemap: number;
  total_urls_after_dedup: number;
  total_urls_after_filter: number;
  total_crawled: number;
  total_success: number;
  total_errors: number;
  success_rate: string;
  elapsed_time: string;
  output_files: string[];
  crawled_at: string;
}

/** Result of crawling a single page: discriminated union */
export type CrawlResult =
  | { success: true; data: PageData }
  | { success: false; error: CrawlError };
