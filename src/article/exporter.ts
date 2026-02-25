import * as fs from "fs";
import * as path from "path";
import { ArticleData } from "./types";

/**
 * Export all articles to a single articles.json file.
 */
export function exportArticlesJson(
  articles: ArticleData[],
  outputDir: string
): string {
  fs.mkdirSync(outputDir, { recursive: true });
  const filePath = path.join(outputDir, "articles.json");
  fs.writeFileSync(filePath, JSON.stringify(articles, null, 2) + "\n", "utf-8");
  return filePath;
}

/**
 * Export each article as a standalone HTML file: article_{slug}.html
 * slug = last non-empty path segment of the article URL.
 */
export function exportArticlesHtml(
  articles: ArticleData[],
  outputDir: string
): string[] {
  fs.mkdirSync(outputDir, { recursive: true });
  const written: string[] = [];

  for (const article of articles) {
    const slug =
      article.url
        .split("/")
        .filter(Boolean)
        .at(-1) ?? "article";

    const filePath = path.join(outputDir, `article_${slug}.html`);
    const content = [
      `<!-- SOURCE: ${article.url} -->`,
      `<!-- TITLE: ${article.title} -->`,
      `<!-- SCRAPED: ${article.scraped_at} -->`,
      article.content_html,
    ].join("\n");

    fs.writeFileSync(filePath, content, "utf-8");
    written.push(filePath);
  }

  return written;
}
