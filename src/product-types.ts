/** All fields are dynamic — keys are label-derived snake_case strings */
export type ProductVariant = Record<string, string>;

export interface ProductData {
  name: string;
  url: string;
  short_description: string;
  long_description: string;
  breadcrumb: Array<{ title: string; url: string }>;
  parameters: Record<string, string>;
  variants: ProductVariant[];
  images: string[];
  badges: string[];
}

export interface ProductScrapeResult {
  scraped_at: string;
  source_url: string;
  product: ProductData;
}

export type ProductCrawlResult =
  | { success: true; data: ProductScrapeResult }
  | { success: false; url: string; error: string };
