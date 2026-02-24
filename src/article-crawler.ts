import { AxiosInstance } from "axios";
import * as cheerio from "cheerio";
import { withRetry, getErrorMessage } from "./utils";
import { extractArticle } from "./article-extractor";
import { ArticleCrawlResult } from "./article-types";

/**
 * Fetch an article page and extract structured data.
 */
export async function crawlArticle(
  url: string,
  http: AxiosInstance
): Promise<ArticleCrawlResult> {
  try {
    const response = await withRetry(() =>
      http.get<string>(url, { responseType: "text" })
    );
    const $ = cheerio.load(response.data);
    const data = extractArticle($, url);
    return { success: true, data };
  } catch (err) {
    return { success: false, url, error: getErrorMessage(err) };
  }
}
