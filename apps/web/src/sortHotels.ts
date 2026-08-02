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
  | "best"
  | "one"
  | "two"
  | "three";

export type SortDir = "asc" | "desc";

export type PriceRoom = "1" | "2" | "3";

export type SortMode =
  | "recent-desc"
  | "recent-asc"
  | "name-asc"
  | "name-desc"
  | "rating-desc"
  | "rating-asc"
  | "weighted-desc"
  | "weighted-asc"
  | "best-desc"
  | "best-asc"
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
    case "best":
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

function noteRoomPrice(note: HotelNote, room: PriceRoom): number | null {
  const raw =
    room === "1"
      ? note.priceOneRoom
      : room === "2"
        ? note.priceTwoRooms
        : note.priceThreeRooms;
  return priceNumber(raw);
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

/**
 * Rank-based scores in [0, 1]: best rank → 1, worst → 0.
 * Missing values get the worst rank. Ties share the average rank.
 * Unlike min–max, a small edge (e.g. 4 000 ₽ cheaper) still earns a full win.
 */
function rankScores(
  values: Array<number | null>,
  higherIsBetter: boolean,
): number[] {
  const indexed = values.map((v, i) => ({ v, i }));
  indexed.sort((a, b) => {
    if (a.v == null && b.v == null) return 0;
    if (a.v == null) return 1;
    if (b.v == null) return -1;
    return higherIsBetter ? b.v - a.v : a.v - b.v;
  });
  const n = values.length;
  if (n === 1) return [values[0] == null ? 0 : 1];
  const rankOf = new Array<number>(n);
  let i = 0;
  while (i < n) {
    let j = i;
    while (
      j + 1 < n &&
      indexed[j + 1].v === indexed[i].v
    ) {
      j++;
    }
    // Average 0-based rank for the tie group, then map to [0,1] (best=1).
    const avgRank = (i + j) / 2;
    const score = 1 - avgRank / (n - 1);
    for (let k = i; k <= j; k++) {
      rankOf[indexed[k].i] = indexed[i].v == null ? 0 : score;
    }
    i = j + 1;
  }
  return rankOf;
}

/** Clamp a price-weight percent to 0–100 (integer). */
export function clampBestPricePercent(value: number): number {
  if (!Number.isFinite(value)) return 60;
  return Math.min(100, Math.max(0, Math.round(value)));
}

/**
 * Composite “best overall” score in [0, 1]:
 * cheaper room price + higher weighted rating, blended by `pricePercent`
 * (e.g. 60 → 60% price, 40% weighted). Ranks within the current list.
 */
export function bestOverallScores(
  notes: HotelNote[],
  prior: RatingPrior,
  priceRoom: PriceRoom,
  pricePercent = 60,
): Map<string, number> {
  const priceW = clampBestPricePercent(pricePercent) / 100;
  const ratingW = 1 - priceW;
  const prices = notes.map((n) => noteRoomPrice(n, priceRoom));
  const weighteds = notes.map((n) =>
    weightedRating(n.rating, n.reviewCount, prior),
  );
  const priceN = rankScores(prices, false);
  const weightedN = rankScores(weighteds, true);
  const out = new Map<string, number>();
  notes.forEach((n, i) => {
    out.set(n.id, priceN[i] * priceW + weightedN[i] * ratingW);
  });
  return out;
}

export function sortHotels(
  notes: HotelNote[],
  mode: SortMode,
  prior?: RatingPrior,
  priceRoom: PriceRoom = "2",
  bestPricePercent = 60,
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
    case "best-asc":
    case "best-desc": {
      const priorSafe = prior ?? { mean: 8.5, strength: 250 };
      const scores = bestOverallScores(
        list,
        priorSafe,
        priceRoom,
        bestPricePercent,
      );
      const ascending = mode === "best-asc";
      return list.sort((a, b) => {
        const fav = compareFavoritesFirst(a, b);
        if (fav !== 0) return fav;
        const aS = scores.get(a.id) ?? 0;
        const bS = scores.get(b.id) ?? 0;
        if (aS !== bS) return ascending ? aS - bS : bS - aS;
        return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      });
    }
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
