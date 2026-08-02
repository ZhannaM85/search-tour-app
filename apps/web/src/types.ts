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
  notes: string;
  favorite: boolean;
  createdAt: string;
  updatedAt: string;
};

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
