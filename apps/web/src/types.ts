export type PriceHistoryEntry = {
  price: string;
  operator: string;
  capturedAt: string; // ISO
};

export type HotelNote = {
  id: string;
  hotelId: number | null;
  name: string;
  pageUrl: string;
  photoUrl: string;
  latitude: number;
  longitude: number;
  priceOneRoom: string;
  priceTwoRooms: string;
  priceThreeRooms: string;
  /** Tour operator for the 1-room price offer (auto-filled or manual). */
  operatorOneRoom: string;
  /** Tour operator for the 2-room price offer (auto-filled or manual). */
  operatorTwoRooms: string;
  /** Tour operator for the 3-room price offer (auto-filled or manual). */
  operatorThreeRooms: string;
  /** Last GetTours URL from curl parse — used by per-hotel price refresh. */
  tourRequestUrl: string;
  /** Referer from that curl (operator/meal filters + hotel page). */
  tourRefererUrl: string;
  /** Prior 1-room prices (newest first), capped at 10. */
  priceHistoryOneRoom: PriceHistoryEntry[];
  priceHistoryTwoRooms: PriceHistoryEntry[];
  priceHistoryThreeRooms: PriceHistoryEntry[];
  /** Star category from hotel page (e.g. 5). */
  stars: number | null;
  /** Guest rating from hotel page (e.g. 9.58). */
  rating: number | null;
  /** Review / vote count from hotel page (e.g. 388). */
  reviewCount: number | null;
  notes: string;
  favorite: boolean;
  createdAt: string;
  updatedAt: string;
};

/** Compact quality line: `5★ · 9.58 (388)`. */
export function formatHotelQuality(note: {
  stars: number | null;
  rating: number | null;
  reviewCount: number | null;
}): string | null {
  const bits: string[] = [];
  if (note.stars != null) bits.push(`${note.stars}★`);
  if (note.rating != null) {
    const ratingText = String(Math.round(note.rating * 100) / 100);
    bits.push(
      note.reviewCount != null
        ? `${ratingText} (${note.reviewCount})`
        : ratingText,
    );
  } else if (note.reviewCount != null) {
    bits.push(`(${note.reviewCount})`);
  }
  return bits.length ? bits.join(" · ") : null;
}

export type ParsedTourCurl = {
  requestUrl: string;
  hotelId: number | null;
  name: string;
  pageUrl: string;
  photoUrl: string;
  latitude: number;
  longitude: number;
  refererUrl: string;
};

export const PRICE_HISTORY_CAP = 10;

export function prependPriceHistory(
  history: PriceHistoryEntry[],
  entry: PriceHistoryEntry,
  cap = PRICE_HISTORY_CAP,
): PriceHistoryEntry[] {
  return [entry, ...history].slice(0, cap);
}
