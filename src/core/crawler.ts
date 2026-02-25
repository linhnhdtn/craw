import { AxiosInstance } from "axios";
import * as cheerio from "cheerio";
import { PageData, CrawlResult } from "./types";
import { withRetry, getErrorMessage, getErrorStatus } from "./utils";

/** Selectors tried in order to find the main content area */
const CONTENT_SELECTORS = [
  "main",
  "article",
  ".main-content",
  ".content",
  "#content",
  ".page-content",
];

/**
 * Crawl a single URL: fetch HTML, extract structured data.
 * Retries once on failure before recording an error.
 * @param url - The page URL to crawl
 * @param http - Configured axios instance
 * @returns CrawlResult — success with PageData or failure with CrawlError
 */
export async function crawlPage(
  url: string,
  http: AxiosInstance
): Promise<CrawlResult> {
  try {
    const response = await withRetry(() =>
      http.get<string>(url, { responseType: "text" })
    );
    const $ = cheerio.load(response.data);
    const baseUrl = new URL(url);
    const baseHost = baseUrl.hostname;

    // --- Content extraction ---
    const content = extractContent($);
    const wordCount = content ? content.split(/\s+/).length : 0;

    // --- Images (absolute URLs) ---
    const images = extractImages($, baseUrl);

    // --- Links ---
    const { internal, externalCount } = extractLinks($, baseHost);

    // --- JSON-LD ---
    const jsonLdRaw = extractJsonLd($);
    const jsonLdString = jsonLdRaw ? JSON.stringify(jsonLdRaw) : "";

    // --- Price / Currency ---
    const { price, currency } = extractPrice($, jsonLdRaw);

    // --- Page type ---
    const pageType = classifyPage(url, jsonLdRaw);

    const data: PageData = {
      url,
      status_code: response.status,
      title: $("title").first().text().trim(),
      h1: $("h1").first().text().trim(),
      meta_description:
        $('meta[name="description"]').attr("content")?.trim() ?? "",
      meta_keywords:
        $('meta[name="keywords"]').attr("content")?.trim() ?? "",
      canonical: $('link[rel="canonical"]').attr("href")?.trim() ?? "",
      og_image:
        $('meta[property="og:image"]').attr("content")?.trim() ?? "",
      content,
      word_count: wordCount,
      images,
      images_count: images.length,
      internal_links: internal,
      internal_links_count: internal.length,
      external_links_count: externalCount,
      json_ld: jsonLdString,
      price,
      currency,
      page_type: pageType,
      crawled_at: new Date().toISOString(),
    };

    return { success: true, data };
  } catch (err) {
    return {
      success: false,
      error: {
        url,
        status_code: getErrorStatus(err),
        error_message: getErrorMessage(err),
      },
    };
  }
}

/**
 * Extract main text content using a cascade of selectors.
 * Falls back to <body> if no semantic container is found.
 * Strips scripts, styles, nav, header, footer before extracting text.
 * Truncates to 2000 characters.
 */
function extractContent($: cheerio.CheerioAPI): string {
  // Remove noise elements
  $("script, style, noscript, iframe, svg, nav, header, footer").remove();

  let text = "";
  for (const sel of CONTENT_SELECTORS) {
    const el = $(sel).first();
    if (el.length) {
      text = el.text();
      break;
    }
  }
  if (!text) {
    text = $("body").first().text();
  }

  const raw = text.replace(/\s+/g, " ").trim();
  return raw.slice(0, 2000);
}

/**
 * Extract all image src attributes as absolute URLs.
 */
function extractImages(
  $: cheerio.CheerioAPI,
  baseUrl: URL
): string[] {
  const imgs: string[] = [];
  $("img[src]").each((_, el) => {
    const src = $(el).attr("src");
    if (src) {
      try {
        imgs.push(new URL(src, baseUrl.origin).href);
      } catch {
        // skip malformed URLs
      }
    }
  });
  return imgs;
}

/**
 * Extract internal and external link counts and internal link URLs.
 */
function extractLinks(
  $: cheerio.CheerioAPI,
  baseHost: string
): { internal: string[]; externalCount: number } {
  const internal: string[] = [];
  let externalCount = 0;

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
      return;
    }
    const isRelative = href.startsWith("/") && !href.startsWith("//");
    if (isRelative) {
      internal.push(href);
      return;
    }
    try {
      const linkHost = new URL(href).hostname;
      if (linkHost === baseHost) {
        internal.push(href);
      } else {
        externalCount++;
      }
    } catch {
      // skip malformed
    }
  });

  return { internal, externalCount };
}

/**
 * Extract the first JSON-LD script block, parsed as an object.
 * Returns null if none found or parsing fails.
 */
function extractJsonLd($: cheerio.CheerioAPI): Record<string, unknown> | null {
  const script = $('script[type="application/ld+json"]').first().html();
  if (!script) return null;
  try {
    return JSON.parse(script);
  } catch {
    return null;
  }
}

/**
 * Try to extract price and currency from JSON-LD Product schema
 * or common HTML selectors.
 */
function extractPrice(
  $: cheerio.CheerioAPI,
  jsonLd: Record<string, unknown> | null
): { price: string; currency: string } {
  // Try JSON-LD first (Product schema with offers)
  if (jsonLd) {
    const offers = resolveOffers(jsonLd);
    if (offers) {
      const p = String(offers.price ?? offers.lowPrice ?? "");
      const c = String(offers.priceCurrency ?? "");
      if (p) return { price: p, currency: c };
    }
  }

  // Fallback to HTML selectors
  const price =
    $('[itemprop="price"]').attr("content")?.trim() ??
    $('[itemprop="price"]').text().trim() ??
    $(".price, .product-price").first().text().replace(/[^\d.,]/g, "").trim();

  const currency =
    $('[itemprop="priceCurrency"]').attr("content")?.trim() ?? "";

  return { price: price || "", currency };
}

/**
 * Dig into a JSON-LD object to find an offers/Offer node.
 */
function resolveOffers(
  obj: Record<string, unknown>
): Record<string, unknown> | null {
  if (obj.offers && typeof obj.offers === "object") {
    const offers = obj.offers as Record<string, unknown>;
    // offers could be an array
    if (Array.isArray(offers)) return (offers[0] as Record<string, unknown>) ?? null;
    return offers;
  }
  return null;
}

/**
 * Classify a page type based on URL patterns and JSON-LD schema.
 */
function classifyPage(
  url: string,
  jsonLd: Record<string, unknown> | null
): PageData["page_type"] {
  const path = new URL(url).pathname;

  if (/\/a\/\d+\//.test(path)) return "article";
  if (/\/c\//.test(path) || /\/choose-/.test(path)) return "category";
  if (/\/p\//.test(path)) return "product";
  if (/gallery/i.test(path)) return "gallery";

  // Check JSON-LD @type
  if (jsonLd) {
    const type = String(jsonLd["@type"] ?? "").toLowerCase();
    if (type === "product") return "product";
    if (type === "article" || type === "newsarticle" || type === "blogposting")
      return "article";
  }

  return "page";
}
