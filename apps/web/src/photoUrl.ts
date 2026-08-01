/**
 * Build a hotel photo URL from id + hotel page host.
 * Page `https://example.com/...` → `https://hotels.example.com/i/im/{id}_0_1280_720_1.jpg`
 */
export function photoUrlFromHotelId(
  hotelId: number | null | undefined,
  pageUrl: string,
): string {
  if (hotelId == null || !Number.isFinite(hotelId)) return "";
  const page = pageUrl.trim();
  if (!page) return "";
  try {
    const u = new URL(page);
    let host = u.hostname;
    if (host.startsWith("www.")) host = host.slice(4);
    if (!host.includes(".")) return "";
    return `https://hotels.${host}/i/im/${hotelId}_0_1280_720_1.jpg`;
  } catch {
    return "";
  }
}

/** Fill empty photoUrl for notes that already have hotelId + pageUrl. */
export function fillMissingPhotos(notes: {
  hotelId: number | null;
  pageUrl: string;
  photoUrl: string;
}[]): { notes: typeof notes; filled: number } {
  let filled = 0;
  const next = notes.map((n) => {
    if (n.photoUrl.trim()) return n;
    const photoUrl = photoUrlFromHotelId(n.hotelId, n.pageUrl);
    if (!photoUrl) return n;
    filled += 1;
    return { ...n, photoUrl };
  });
  return { notes: next, filled };
}
