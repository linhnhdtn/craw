import * as fs from "fs";
import * as path from "path";
import { ProductScrapeResult } from "./product-types";

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

  // Collect all unique parameter keys across all products (sorted for stable column order)
  const paramKeySet = new Set<string>();
  for (const { product } of results) {
    for (const key of Object.keys(product.parameters)) {
      paramKeySet.add(key);
    }
  }
  const paramKeys = Array.from(paramKeySet).sort();

  const headers = [
    "name",
    "url",
    "category_name",
    "category_url",
    ...paramKeys,
    "short_description",
    "variant_color",
    "variant_art_no",
    "variant_price_incl",
    "variant_price_excl",
    "variant_in_stock",
    "variant_status",
    "main_image",
    "all_images",
    "badges",
    "scraped_at",
  ];

  const lines: string[] = [BOM + headers.map(escapeCsv).join(",")];

  for (const { scraped_at, product } of results) {
    const { parameters: p } = product;

    // At least one row even if no variants
    const variants = product.variants.length > 0 ? product.variants : [null];

    for (const variant of variants) {
      const cells = [
        product.name,
        product.url,
        product.category.name,
        product.category.url,
        ...paramKeys.map((k) => p[k] ?? ""),
        product.short_description,
        variant?.color ?? "",
        variant?.art_no ?? "",
        variant?.price_incl_vat ?? "",
        variant?.price_excl_vat ?? "",
        variant != null ? String(variant.in_stock) : "",
        variant?.status_text ?? "",
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
