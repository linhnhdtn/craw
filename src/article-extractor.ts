import * as cheerio from "cheerio";
import { ArticleData, ArticleEmbed } from "./article-types";

type CheerioEl = ReturnType<cheerio.CheerioAPI>;

/**
 * Read iframe src: data-privacy-src → src → data-src (privacy systems block real src)
 */
function getIframeSrc($el: CheerioEl): string {
  return (
    $el.attr("data-privacy-src") ??
    $el.attr("src") ??
    $el.attr("data-src") ??
    ""
  );
}

function detectEmbedType(src: string): ArticleEmbed["type"] {
  if (src.includes("youtube.com") || src.includes("youtube-nocookie.com")) {
    return "youtube";
  }
  return src ? "iframe" : "unknown";
}

/**
 * Extract width or height: style attribute first, then element attribute.
 * Normalises bare numbers to "Npx".
 */
function getDimension(
  $el: CheerioEl,
  prop: "width" | "height"
): string | undefined {
  const style = $el.attr("style") ?? "";
  const styleMatch = style.match(new RegExp(`${prop}:\\s*([\\d.]+\\w+)`));
  if (styleMatch) return styleMatch[1];

  const attr = $el.attr(prop);
  if (attr) return /^\d+$/.test(attr) ? `${attr}px` : attr;

  return undefined;
}

/**
 * Extract all data from an artcrystal.eu article page (/a/{id}/{slug}).
 */
export function extractArticle(
  $: cheerio.CheerioAPI,
  sourceUrl: string
): ArticleData {
  const url =
    $("link[rel='canonical']").attr("href")?.trim() ?? sourceUrl;

  // Title: h1.faqTitle → og:title fallback
  const title =
    $("h1.faqTitle").first().text().trim() ||
    $("meta[property='og:title']").attr("content")?.trim() ||
    "";

  const $content = $(".userHTMLContent.faqAnswer").first();

  // Clean noise before extracting
  $content.find("script, style").remove();

  // Extract embeds from all iframes inside content
  const embeds: ArticleEmbed[] = [];
  $content.find("iframe").each((_, el) => {
    const $el = $(el);
    const src = getIframeSrc($el);
    embeds.push({
      type: detectEmbedType(src),
      src,
      width: getDimension($el, "width"),
      height: getDimension($el, "height"),
    });
  });

  const content_html = $content.html()?.trim() ?? "";
  const content_text = $content.text().replace(/\s+/g, " ").trim();

  return {
    url,
    title,
    content_html,
    content_text,
    embeds,
    scraped_at: new Date().toISOString(),
  };
}
