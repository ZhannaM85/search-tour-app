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
  refererUrl?: string;
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
