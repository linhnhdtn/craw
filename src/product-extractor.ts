import * as cheerio from "cheerio";
import { ProductData, ProductVariant } from "./product-types";

const BASE_URL = "https://www.artcrystal.eu";

/** Known parameter label → snake_case key mappings */
const PARAM_KEY_MAP: Record<string, string> = {
  "category": "category",
  "diameter": "diameter",
  "height": "height",
  "weight": "weight",
  "number of bulbs": "bulb_count",
  "max wattage/socket": "max_wattage",
  "max. wattage/socket": "max_wattage",
  "material": "material",
  "color": "color",
  "bulb type": "bulb_type",
  "bulb base": "bulb_base",
  "ip rating": "ip_rating",
  "voltage": "voltage",
};

function toSnakeCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeParamKey(raw: string): string {
  const lower = raw.toLowerCase().trim();
  return PARAM_KEY_MAP[lower] ?? toSnakeCase(raw);
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
  const breadcrumb: string[] = [];
  $("ul.breadcrumbs a").each((_, el) => {
    const text = cleanText($(el).text());
    if (text) breadcrumb.push(text);
  });

  // ── Parameters + Category from tabAdditionalInfo ──────────────────
  let categoryName = "";
  let categoryUrl = "";
  const parameters: Record<string, string> = {};

  $("table.tabAdditionalInfo tr").each((_, tr) => {
    const tds = $(tr).find("td");
    if (tds.length < 2) return;
    const rawKey = cleanText(tds.eq(0).text());
    const valTd = tds.eq(1);

    if (rawKey.toLowerCase() === "category") {
      const catLink = valTd.find("a").first();
      categoryName = cleanText(catLink.text());
      const href = catLink.attr("href") ?? "";
      categoryUrl = makeAbsolute(href);
    } else {
      const paramKey = normalizeParamKey(rawKey);
      const paramVal = cleanText(valTd.text());
      if (paramKey && paramVal) {
        parameters[paramKey] = paramVal;
      }
    }
  });

  // ── Variants ──────────────────────────────────────────────────────
  const variants: ProductVariant[] = [];

  $(".s1-buttonRows .s1-buttonRow").each((_, row) => {
    const $row = $(row);

    const color = cleanText(
      $row.find(".s1-buttonRow-val .s1-buttonRow-txt").first().text()
    );
    const artNo = cleanText(
      $row.find(".s1-buttonRow-identifier .s1-buttonRow-txt").first().text()
    );

    const priceInclRaw = cleanText(
      $row.find(".price .priceCombTaxValueNumber").first().text()
    );

    const priceInclNum = parsePrice(priceInclRaw);
    const priceExcl =
      priceInclNum !== null ? formatPrice(priceInclNum / 1.21) : "";

    // In-stock: .s1-buttonRow-wh with style color: #228B22 (green)
    const whEl = $row.find(".s1-buttonRow-wh").first();
    const whStyle = (whEl.attr("style") ?? "").toLowerCase();
    const inStock = whStyle.includes("#228b22");
    const statusText = cleanText(whEl.text());

    variants.push({
      color,
      art_no: artNo,
      price_incl_vat: priceInclRaw,
      price_excl_vat: priceExcl,
      in_stock: inStock,
      status_text: statusText,
    });
  });

  // Fallback: no variant rows → treat main price as single variant
  if (variants.length === 0) {
    const mainPriceRaw = cleanText(
      $(".price .priceCombTaxValueNumber").first().text()
    );
    if (mainPriceRaw) {
      const mainPriceNum = parsePrice(mainPriceRaw);
      const mainPriceExcl =
        mainPriceNum !== null ? formatPrice(mainPriceNum / 1.21) : "";
      variants.push({
        color: "",
        art_no: "",
        price_incl_vat: mainPriceRaw,
        price_excl_vat: mainPriceExcl,
        in_stock: false,
        status_text: "",
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
    category: { name: categoryName, url: categoryUrl },
    parameters,
    variants,
    images,
    badges,
  };
}
