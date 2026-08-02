/**
 * Sanitize a shortlist Export JSON for the public/read-only viewer.
 *
 * Usage:
 *   node scripts/prepare-public-shortlist.mjs path/to/export.json
 *   node scripts/prepare-public-shortlist.mjs path/to/export.json apps/web/public/shortlist.json
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultOut = resolve(root, "apps/web/public/shortlist.json");

const inputPath = process.argv[2];
const outputPath = resolve(process.argv[3] ?? defaultOut);

if (!inputPath) {
  console.error(
    "Usage: node scripts/prepare-public-shortlist.mjs <export.json> [out.json]",
  );
  process.exit(1);
}

const raw = JSON.parse(readFileSync(resolve(inputPath), "utf8"));

function asHotels(value) {
  if (value && typeof value === "object" && Array.isArray(value.hotels)) {
    return value.hotels;
  }
  if (Array.isArray(value)) return value;
  throw new Error("Input must be an Export envelope { hotels } or a hotel array.");
}

function sanitizeHotel(h) {
  if (!h || typeof h !== "object") {
    throw new Error("Invalid hotel entry.");
  }
  const {
    tourRequestUrl: _tourRequestUrl,
    tourRefererUrl: _tourRefererUrl,
    ...rest
  } = h;
  return {
    ...rest,
    tourRequestUrl: "",
    tourRefererUrl: "",
    favorite: false,
    disliked: false,
  };
}

const hotels = asHotels(raw).map(sanitizeHotel);
const exportedAt =
  raw && typeof raw === "object" && typeof raw.exportedAt === "string"
    ? raw.exportedAt
    : new Date().toISOString();

const out = {
  version: 1,
  exportedAt,
  hotels,
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(out, null, 2)}\n`, "utf8");
console.log(`Wrote ${hotels.length} hotel(s) → ${outputPath}`);
