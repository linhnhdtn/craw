import { AxiosInstance } from "axios";
import { XMLParser } from "fast-xml-parser";
import { withRetry } from "./utils";

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  isArray: (name) => name === "sitemap" || name === "url",
});

/**
 * Fetch and parse a sitemap URL, returning all page URLs found.
 * Handles both sitemap index files (recursive) and standard URL sitemaps.
 * @param sitemapUrl - The URL of the sitemap or sitemap index
 * @param http - Configured axios instance
 * @returns Array of page URL strings
 */
export async function parseSitemap(
  sitemapUrl: string,
  http: AxiosInstance
): Promise<string[]> {
  console.log(`   Fetching: ${sitemapUrl}`);

  const xml = await fetchSitemapXml(sitemapUrl, http);
  const parsed = xmlParser.parse(xml);

  // Sitemap index: contains <sitemapindex><sitemap><loc>
  if (parsed.sitemapindex?.sitemap) {
    const childSitemaps: string[] = parsed.sitemapindex.sitemap
      .map((s: Record<string, unknown>) => s.loc)
      .filter(Boolean) as string[];

    console.log(
      `   Found sitemap index with ${childSitemaps.length} child sitemap(s)`
    );

    const allUrls: string[] = [];
    for (const childUrl of childSitemaps) {
      const urls = await parseSitemap(childUrl, http);
      allUrls.push(...urls);
    }
    return allUrls;
  }

  // Standard sitemap: contains <urlset><url><loc>
  if (parsed.urlset?.url) {
    const urls: string[] = parsed.urlset.url
      .map((u: Record<string, unknown>) => u.loc)
      .filter(Boolean) as string[];
    return urls;
  }

  console.warn(`   Warning: No URLs found in ${sitemapUrl}`);
  return [];
}

/**
 * Fetch raw XML content from a sitemap URL with retry.
 * @param url - The sitemap URL
 * @param http - Configured axios instance
 * @returns The XML string
 */
async function fetchSitemapXml(
  url: string,
  http: AxiosInstance
): Promise<string> {
  const response = await withRetry(() =>
    http.get<string>(url, {
      headers: { Accept: "application/xml, text/xml, */*" },
      responseType: "text",
    })
  );
  return response.data;
}

/**
 * Filter URLs by a regex pattern.
 * @param urls - Array of URL strings
 * @param pattern - RegExp to match against URLs
 * @returns Filtered URL array
 */
export function filterUrls(urls: string[], pattern: RegExp): string[] {
  return urls.filter((url) => pattern.test(url));
}
