export interface ArticleEmbed {
  type: "youtube" | "iframe" | "unknown";
  src: string;
  width?: string;
  height?: string;
}

export interface ArticleData {
  url: string;
  title: string;
  content_html: string;
  content_text: string;
  embeds: ArticleEmbed[];
  scraped_at: string;
}

export type ArticleCrawlResult =
  | { success: true; data: ArticleData }
  | { success: false; url: string; error: string };
