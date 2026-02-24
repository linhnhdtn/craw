import { AxiosInstance } from "axios";
import * as cheerio from "cheerio";
import { withRetry, getErrorMessage } from "./utils";
import { extractProduct } from "./product-extractor";
import { ProductCrawlResult } from "./product-types";

/**
 * Fetch a product page and extract structured data.
 * Returns success with ProductScrapeResult or failure with error message.
 */
export async function crawlProduct(
  url: string,
  http: AxiosInstance
): Promise<ProductCrawlResult> {
  try {
    const response = await withRetry(() =>
      http.get<string>(url, { responseType: "text" })
    );
    const $ = cheerio.load(response.data);
    const product = extractProduct($, url);

    return {
      success: true,
      data: {
        scraped_at: new Date().toISOString(),
        source_url: url,
        product,
      },
    };
  } catch (err) {
    return {
      success: false,
      url,
      error: getErrorMessage(err),
    };
  }
}
