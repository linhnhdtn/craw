import * as fs from "fs";
import * as path from "path";
import { ProductScrapeResult } from "./types";

const BOM = "\uFEFF";

function escapeCsv(value: string | number | boolean | null | undefined): string {
  const str = value == null ? "" : String(value);
  if (
    str.includes('"') ||
    str.includes(",") ||
    str.includes("\n") ||
    str.includes("\r")
  ) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Export scraped products to a JSON file (array of ProductScrapeResult).
 */
export function exportProductsJson(
  results: ProductScrapeResult[],
  outputDir: string
): string {
  fs.mkdirSync(outputDir, { recursive: true });
  const filePath = path.join(outputDir, "products.json");
  fs.writeFileSync(filePath, JSON.stringify(results, null, 2) + "\n", "utf-8");
  return filePath;
}

/**
 * Export scraped products to a flat CSV file.
 * Parameter columns are generated dynamically from all keys found in the data.
 * Each variant produces one row; product-level fields are repeated.
 */
export function exportProductsCsv(
  results: ProductScrapeResult[],
  outputDir: string
): string {
  fs.mkdirSync(outputDir, { recursive: true });
  const filePath = path.join(outputDir, "products.csv");

  // Collect all unique parameter keys (sorted for stable column order)
  const paramKeySet = new Set<string>();
  for (const { product } of results) {
    for (const key of Object.keys(product.parameters)) paramKeySet.add(key);
  }
  const paramKeys = Array.from(paramKeySet).sort();

  // Collect all unique variant keys (sorted)
  const variantKeySet = new Set<string>();
  for (const { product } of results) {
    for (const variant of product.variants) {
      for (const key of Object.keys(variant)) variantKeySet.add(key);
    }
  }
  const variantKeys = Array.from(variantKeySet).sort();

  const headers = [
    "name",
    "url",
    ...paramKeys,
    "short_description",
    ...variantKeys.map((k) => `variant_${k}`),
    "main_image",
    "all_images",
    "badges",
    "scraped_at",
  ];

  const lines: string[] = [BOM + headers.map(escapeCsv).join(",")];

  for (const { scraped_at, product } of results) {
    const { parameters: p } = product;

    // At least one row even if no variants
    const variants = product.variants.length > 0 ? product.variants : [{}];

    for (const variant of variants) {
      const cells = [
        product.name,
        product.url,
        ...paramKeys.map((k) => p[k] ?? ""),
        product.short_description,
        ...variantKeys.map((k) => variant[k] ?? ""),
        product.images[0] ?? "",
        product.images.join("|"),
        product.badges.join("|"),
        scraped_at,
      ];
      lines.push(cells.map(escapeCsv).join(","));
    }
  }

  fs.writeFileSync(filePath, lines.join("\n") + "\n", "utf-8");
  return filePath;
}
