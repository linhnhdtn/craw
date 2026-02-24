export interface ProductVariant {
  color: string;
  art_no: string;
  price_incl_vat: string;
  price_excl_vat: string;
  in_stock: boolean;
  status_text: string;
}

export interface ProductCategory {
  name: string;
  url: string;
}

export interface ProductData {
  name: string;
  url: string;
  short_description: string;
  long_description: string;
  breadcrumb: string[];
  category: ProductCategory;
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
