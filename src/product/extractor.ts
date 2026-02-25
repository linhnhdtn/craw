import * as cheerio from "cheerio";
import { ProductData, ProductVariant } from "./types";

const BASE_URL = "https://www.artcrystal.eu";

function toSnakeCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function makeAbsolute(href: string): string {
  if (!href) return "";
  if (href.startsWith("http://") || href.startsWith("https://")) return href;
  return BASE_URL + (href.startsWith("/") ? href : "/" + href);
}

function cleanText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Parse a price string like "770 €" or "1 250,00 €" into a number.
 * Handles Czech locale: space = thousands separator, comma = decimal.
 */
function parsePrice(raw: string): number | null {
  // Remove currency symbols and whitespace, keep digits . and ,
  const s = raw.replace(/[^\d.,]/g, "");
  if (!s) return null;
  // Remove periods used as thousands separators (e.g. "1.250")
  // then replace comma with period for decimal
  const normalized = s.replace(/\.(?=\d{3}(?:[,]|$))/g, "").replace(",", ".");
  const num = parseFloat(normalized);
  return isNaN(num) ? null : num;
}

function formatPrice(num: number): string {
  return num.toFixed(2);
}

/**
 * Extract all product data from a loaded cheerio instance.
 */
export function extractProduct($: cheerio.CheerioAPI, sourceUrl: string): ProductData {
  // ── Basic info ────────────────────────────────────────────────────
  const name = cleanText($("h1[itemprop='name']").first().text());
  const url = $("link[rel='canonical']").attr("href")?.trim() ?? sourceUrl;
  const shortDescription = cleanText($(".detailShort").first().text());
  const longDescription = cleanText(
    $(".userHTMLContent.ac-product__long-text").first().text()
  );

  // ── Breadcrumb ────────────────────────────────────────────────────
  const breadcrumb: Array<{ title: string; url: string }> = [];
  $("ul.breadcrumbs a").each((_, el) => {
    const $el = $(el);
    const title = cleanText($el.find("span[itemprop='name']").text() || $el.text());
    const href = $el.attr("href") ?? "";
    if (title) breadcrumb.push({ title, url: makeAbsolute(href) });
  });

  // ── Parameters from tabAdditionalInfo ────────────────────────────
  const parameters: Record<string, string> = {};

  $("table.tabAdditionalInfo tr").each((_, tr) => {
    const tds = $(tr).find("td");
    if (tds.length < 2) return;
    const rawKey = cleanText(tds.eq(0).text());
    const paramKey = toSnakeCase(rawKey);
    const paramVal = cleanText(tds.eq(1).text());
    if (paramKey && paramVal) {
      parameters[paramKey] = paramVal;
    }
  });

  // ── Variants ──────────────────────────────────────────────────────
  const variants: ProductVariant[] = [];

  $(".s1-buttonRows .s1-buttonRow").each((_, row) => {
    const $row = $(row);
    const variant: ProductVariant = {};

    // Extract all labeled attribute values (e.g. "Variant: Gold", "Color: Silver")
    // Pattern: <span class="s1-buttonRow-val">LABEL: <span class="s1-buttonRow-txt">VALUE</span></span>
    $row.find(".s1-buttonRow-val").each((_, valEl) => {
      const $val = $(valEl);
      const $clone = $val.clone();
      $clone.find(".s1-buttonRow-txt").remove();
      const labelRaw = cleanText($clone.text());
      const value = cleanText($val.find(".s1-buttonRow-txt").first().text());
      if (!value) return;
      const key = labelRaw ? toSnakeCase(labelRaw) : `attr_${Object.keys(variant).length + 1}`;
      if (key) variant[key] = value;
    });

    // Extract all labeled line fields (e.g. "Art.No.: AL153")
    // Pattern: <p class="s1-buttonRow-line ...">LABEL: <span class="s1-buttonRow-txt">VALUE</span></p>
    $row.find(".s1-buttonRow-line").each((_, lineEl) => {
      const $line = $(lineEl);
      const $clone = $line.clone();
      $clone.find(".s1-buttonRow-txt").remove();
      const labelRaw = cleanText($clone.text());
      const value = cleanText($line.find(".s1-buttonRow-txt").first().text());
      if (!value) return;
      const key = labelRaw ? toSnakeCase(labelRaw) : `line_${Object.keys(variant).length + 1}`;
      if (key) variant[key] = value;
    });

    // Price
    const priceInclRaw = cleanText(
      $row.find(".price .priceCombTaxValueNumber").first().text()
    );
    if (priceInclRaw) {
      variant["price_incl_vat"] = priceInclRaw;
      const priceInclNum = parsePrice(priceInclRaw);
      variant["price_excl_vat"] =
        priceInclNum !== null ? formatPrice(priceInclNum / 1.21) : "";
    }

    // Stock status
    const whEl = $row.find(".s1-buttonRow-wh").first();
    const whStyle = (whEl.attr("style") ?? "").toLowerCase();
    variant["in_stock"] = whStyle.includes("#228b22") ? "true" : "false";
    const statusText = cleanText(whEl.text());
    if (statusText) variant["status_text"] = statusText;

    variants.push(variant);
  });

  // Fallback: no variant rows → treat main price as single variant
  if (variants.length === 0) {
    const mainPriceRaw = cleanText(
      $(".price .priceCombTaxValueNumber").first().text()
    );
    if (mainPriceRaw) {
      const mainPriceNum = parsePrice(mainPriceRaw);
      variants.push({
        price_incl_vat: mainPriceRaw,
        price_excl_vat:
          mainPriceNum !== null ? formatPrice(mainPriceNum / 1.21) : "",
        in_stock: "false",
      });
    }
  }

  // ── Images ────────────────────────────────────────────────────────
  const images: string[] = [];
  $(".s1-detailGallery figure[data-full]").each((_, el) => {
    const dataFull = $(el).attr("data-full") ?? "";
    if (dataFull) images.push(makeAbsolute(dataFull));
  });

  // ── Badges ────────────────────────────────────────────────────────
  const badges: string[] = [];
  $("p.indicators .indicator").each((_, el) => {
    const text = cleanText($(el).text());
    if (text) badges.push(text);
  });

  return {
    name,
    url,
    short_description: shortDescription,
    long_description: longDescription,
    breadcrumb,
    parameters,
    variants,
    images,
    badges,
  };
}
