import type { HotelNote } from "./types";
import { parsePriceDigits } from "./formatPrice";
import {
  weightedRating,
  type RatingPrior,
} from "./weightedRating";

export type SortField =
  | "recent"
  | "name"
  | "rating"
  | "weighted"
  | "one"
  | "two"
  | "three";

export type SortDir = "asc" | "desc";

export type SortMode =
  | "recent-desc"
  | "recent-asc"
  | "name-asc"
  | "name-desc"
  | "rating-desc"
  | "rating-asc"
  | "weighted-desc"
  | "weighted-asc"
  | "one-asc"
  | "one-desc"
  | "two-asc"
  | "two-desc"
  | "three-asc"
  | "three-desc";

/** Default direction when switching to a sort field. */
export function defaultSortDir(field: SortField): SortDir {
  switch (field) {
    case "name":
    case "one":
    case "two":
    case "three":
      return "asc";
    case "recent":
    case "rating":
    case "weighted":
    default:
      return "desc";
  }
}

export function toSortMode(field: SortField, dir: SortDir): SortMode {
  return `${field}-${dir}` as SortMode;
}

export function sortFieldFromMode(mode: SortMode): SortField {
  return mode.replace(/-(asc|desc)$/, "") as SortField;
}

export function sortDirFromMode(mode: SortMode): SortDir {
  return mode.endsWith("-asc") ? "asc" : "desc";
}

function priceNumber(raw: string): number | null {
  const digits = parsePriceDigits(raw);
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) ? n : null;
}

/** Missing prices always sort last. */
function comparePrices(aRaw: string, bRaw: string, ascending: boolean): number {
  const a = priceNumber(aRaw);
  const b = priceNumber(bRaw);
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return ascending ? a - b : b - a;
}

function compareFavoritesFirst(a: HotelNote, b: HotelNote): number {
  if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
  return 0;
}

/**
 * Compare by raw rating, or by Bayesian-weighted rating when `useWeighted`.
 * Missing scores always last. Ties: more reviews, then name.
 */
function compareRating(
  a: HotelNote,
  b: HotelNote,
  ascending: boolean,
  prior: RatingPrior | undefined,
  useWeighted: boolean,
): number {
  const aScore =
    useWeighted && prior
      ? weightedRating(a.rating, a.reviewCount, prior)
      : a.rating;
  const bScore =
    useWeighted && prior
      ? weightedRating(b.rating, b.reviewCount, prior)
      : b.rating;
  if (aScore == null && bScore == null) return 0;
  if (aScore == null) return 1;
  if (bScore == null) return -1;
  if (aScore !== bScore) {
    return ascending ? aScore - bScore : bScore - aScore;
  }
  const aVotes = a.reviewCount ?? -1;
  const bVotes = b.reviewCount ?? -1;
  if (aVotes !== bVotes) return bVotes - aVotes;
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

export function sortHotels(
  notes: HotelNote[],
  mode: SortMode,
  prior?: RatingPrior,
): HotelNote[] {
  const list = [...notes];
  switch (mode) {
    case "name-asc":
      return list.sort((a, b) => {
        const fav = compareFavoritesFirst(a, b);
        if (fav !== 0) return fav;
        return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      });
    case "name-desc":
      return list.sort((a, b) => {
        const fav = compareFavoritesFirst(a, b);
        if (fav !== 0) return fav;
        return b.name.localeCompare(a.name, undefined, { sensitivity: "base" });
      });
    case "rating-asc":
      return list.sort((a, b) => {
        const fav = compareFavoritesFirst(a, b);
        if (fav !== 0) return fav;
        return compareRating(a, b, true, prior, false);
      });
    case "rating-desc":
      return list.sort((a, b) => {
        const fav = compareFavoritesFirst(a, b);
        if (fav !== 0) return fav;
        return compareRating(a, b, false, prior, false);
      });
    case "weighted-asc":
      return list.sort((a, b) => {
        const fav = compareFavoritesFirst(a, b);
        if (fav !== 0) return fav;
        return compareRating(a, b, true, prior, true);
      });
    case "weighted-desc":
      return list.sort((a, b) => {
        const fav = compareFavoritesFirst(a, b);
        if (fav !== 0) return fav;
        return compareRating(a, b, false, prior, true);
      });
    case "one-asc":
      return list.sort((a, b) =>
        comparePrices(a.priceOneRoom, b.priceOneRoom, true),
      );
    case "one-desc":
      return list.sort((a, b) =>
        comparePrices(a.priceOneRoom, b.priceOneRoom, false),
      );
    case "two-asc":
      return list.sort((a, b) =>
        comparePrices(a.priceTwoRooms, b.priceTwoRooms, true),
      );
    case "two-desc":
      return list.sort((a, b) =>
        comparePrices(a.priceTwoRooms, b.priceTwoRooms, false),
      );
    case "three-asc":
      return list.sort((a, b) =>
        comparePrices(a.priceThreeRooms, b.priceThreeRooms, true),
      );
    case "three-desc":
      return list.sort((a, b) =>
        comparePrices(a.priceThreeRooms, b.priceThreeRooms, false),
      );
    case "recent-asc":
      return list.sort((a, b) => {
        const fav = compareFavoritesFirst(a, b);
        if (fav !== 0) return fav;
        return a.updatedAt.localeCompare(b.updatedAt);
      });
    case "recent-desc":
    default:
      return list.sort((a, b) => {
        const fav = compareFavoritesFirst(a, b);
        if (fav !== 0) return fav;
        return b.updatedAt.localeCompare(a.updatedAt);
      });
  }
}
