const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8787";

export type ParsedHotel = {
  hotelId: number | null;
  name: string;
  pageUrl: string;
  latitude: number;
  longitude: number;
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
