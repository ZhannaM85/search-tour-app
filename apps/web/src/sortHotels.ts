import type { HotelNote } from "./types";
import { parsePriceDigits } from "./formatPrice";

export type SortMode =
  | "recent-desc"
  | "recent-asc"
  | "name-asc"
  | "name-desc"
  | "rating-desc"
  | "rating-asc"
  | "one-asc"
  | "one-desc"
  | "two-asc"
  | "two-desc"
  | "three-asc"
  | "three-desc";

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

/** Missing ratings always sort last. Ties: more reviews, then name. */
function compareRating(a: HotelNote, b: HotelNote, ascending: boolean): number {
  const aRating = a.rating;
  const bRating = b.rating;
  if (aRating == null && bRating == null) return 0;
  if (aRating == null) return 1;
  if (bRating == null) return -1;
  if (aRating !== bRating) {
    return ascending ? aRating - bRating : bRating - aRating;
  }
  const aVotes = a.reviewCount ?? -1;
  const bVotes = b.reviewCount ?? -1;
  if (aVotes !== bVotes) return bVotes - aVotes;
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

export function sortHotels(notes: HotelNote[], mode: SortMode): HotelNote[] {
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
        return compareRating(a, b, true);
      });
    case "rating-desc":
      return list.sort((a, b) => {
        const fav = compareFavoritesFirst(a, b);
        if (fav !== 0) return fav;
        return compareRating(a, b, false);
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
