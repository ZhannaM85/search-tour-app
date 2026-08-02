const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8787";

export type ParsedHotel = {
  hotelId: number | null;
  name: string;
  pageUrl: string;
  photoUrl: string;
  latitude: number;
  longitude: number;
  /** Cheapest 1-room tour price (joined via hotel room catalog). */
  priceOneRoom: number | null;
  /** Cheapest 2-room tour price (joined via hotel room catalog). */
  priceTwoRooms: number | null;
  /** Cheapest 3-room tour price (joined via hotel room catalog). */
  priceThreeRooms: number | null;
  /** Operator name for the winning 1-room offer (aaData[18]). */
  operatorOneRoom: string | null;
  /** Operator name for the winning 2-room offer (aaData[18]). */
  operatorTwoRooms: string | null;
  /** Operator name for the winning 3-room offer (aaData[18]). */
  operatorThreeRooms: string | null;
  requestUrl?: string;
  refererUrl?: string;
};

export type RefreshedPrices = {
  priceOneRoom: number | null;
  priceTwoRooms: number | null;
  priceThreeRooms: number | null;
  operatorOneRoom: string | null;
  operatorTwoRooms: string | null;
  operatorThreeRooms: string | null;
};

export async function parseTourCurl(curl: string): Promise<ParsedHotel> {
  const res = await fetch(`${API_BASE}/api/parse-tour-curl`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ curl }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Parse failed");
  return data;
}

export async function refreshHotelPrices(
  requestUrl: string,
  refererUrl: string,
): Promise<RefreshedPrices> {
  const res = await fetch(`${API_BASE}/api/refresh-hotel-prices`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requestUrl, refererUrl }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Refresh failed");
  return data;
}
