import type { HotelNote } from "./types";
import { parsePriceDigits } from "./formatPrice";

export type SortMode =
  | "recent"
  | "one-asc"
  | "one-desc"
  | "two-asc"
  | "two-desc";

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

export function sortHotels(notes: HotelNote[], mode: SortMode): HotelNote[] {
  const list = [...notes];
  switch (mode) {
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
    case "recent":
    default:
      return list.sort((a, b) => {
        if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
        return b.updatedAt.localeCompare(a.updatedAt);
      });
  }
}
