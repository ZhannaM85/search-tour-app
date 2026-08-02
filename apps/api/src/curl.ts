const IDX = {
  HOTEL_SLUG: 2,
  HOTEL_ID: 3,
  HOTEL_NAME: 7,
  /** Protocol-relative hotel thumbnail, e.g. `//host/i/p/{id}_30.jpg` */
  PHOTO: 29,
  /** Full tour price in request currency (number). */
  PRICE: 42,
  /** System room-type id — joins to hotel page `rooms[].id`. */
  ROOM_TYPE_ID: 44,
  LAT: 92,
  LNG: 93,
} as const;

export type RoomCatalogEntry = {
  id: number;
  name: string;
  roomCount: number;
};

/** Turn `//host/path` or absolute http(s) into a usable https URL. */
export function absoluteHttpUrl(raw: string): string {
  const s = raw.trim();
  if (!s) return "";
  if (s.startsWith("//")) return `https:${s}`;
  if (/^https?:\/\//i.test(s)) return s;
  return "";
}

export function normalizeCurlText(raw: string): string {
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/\^"/g, '"')
    .replace(/\^\^/g, "^")
    .replace(/\^&/g, "&")
    .replace(/\^%/g, "%")
    .replace(/\^\n/g, " ")
    .replace(/\\\n/g, " ")
    .replace(/\^/g, "")
    .trim();
}

export function parseCurlRequest(text: string): {
  url: string;
  headers: Record<string, string>;
  refererUrl: string;
} {
  const urlMatch =
    text.match(/curl\s+"([^"]+)"/i) ??
    text.match(/curl\s+'([^']+)'/i) ??
    text.match(/curl\s+(\S+)/i);
  if (!urlMatch) throw new Error("Could not find URL in curl.");

  const url = urlMatch[1];
  const headers: Record<string, string> = {
    Accept: "application/json, text/plain, */*",
    "Content-Type": "application/json",
  };

  const headerRe = /-H\s+"([^"]+)"/gi;
  let hm: RegExpExecArray | null;
  while ((hm = headerRe.exec(text)) !== null) {
    const line = hm[1];
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (!key || key.toLowerCase() === "content-length") continue;
    headers[key] = value;
  }

  const refererUrl = headers.Referer ?? headers.referer ?? "";
  return { url, headers, refererUrl };
}

function asNumber(row: unknown[], index: number): number | null {
  const v = row[index];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function asString(row: unknown[], index: number): string {
  const v = row[index];
  return v == null ? "" : String(v);
}

function pageUrlFromSlug(slug: string, referer: string): string {
  if (referer) {
    try {
      const u = new URL(referer);
      const path = slug.startsWith("/") ? slug : `/${slug}`;
      return `${u.origin}${path}`;
    } catch {
      /* ignore */
    }
  }
  return slug;
}

/**
 * Prefer mid-size hotel image `/i/im/{hotelId}_0_1280_720_1.jpg` on the same
 * host as the row thumbnail. Never uses the tour-operator logo column.
 */
function hotelPhotoUrl(hotelId: number | null, rowPhoto: string): string {
  const absolute = absoluteHttpUrl(rowPhoto);
  if (hotelId != null && absolute) {
    try {
      const u = new URL(absolute);
      return `${u.origin}/i/im/${hotelId}_0_1280_720_1.jpg`;
    } catch {
      /* fall through */
    }
  }
  return absolute;
}

/**
 * Hotel room catalog is SSR'd into the hotel page as
 * `window.__INITIAL_STATE__.pageModel.hotelDetails.rooms` — not a Network XHR.
 * Each room has `id` (joins GetTours aaData[44]) and `roomCount` (1, 2, …).
 */
export function extractRoomCatalogFromHtml(
  html: string,
): Map<number, RoomCatalogEntry> {
  const map = new Map<number, RoomCatalogEntry>();
  const match = html.match(
    /window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\})\s*;?\s*<\/script>/,
  );
  if (!match) return map;

  let state: unknown;
  try {
    state = JSON.parse(match[1]);
  } catch {
    return map;
  }

  const rooms = (
    state as {
      pageModel?: { hotelDetails?: { rooms?: unknown } };
    }
  )?.pageModel?.hotelDetails?.rooms;

  if (!Array.isArray(rooms)) return map;

  for (const room of rooms) {
    if (!room || typeof room !== "object") continue;
    const r = room as Record<string, unknown>;
    const id = typeof r.id === "number" ? r.id : Number(r.id);
    const roomCount =
      typeof r.roomCount === "number" ? r.roomCount : Number(r.roomCount);
    if (!Number.isFinite(id) || !Number.isFinite(roomCount) || roomCount < 1) {
      continue;
    }
    map.set(id, {
      id,
      name: r.name == null ? "" : String(r.name),
      roomCount,
    });
  }
  return map;
}

function cheapestPricesByRoomCount(
  aaData: unknown[],
  hotelId: number | null,
  catalog: Map<number, RoomCatalogEntry>,
): {
  priceOneRoom: number | null;
  priceTwoRooms: number | null;
  priceThreeRooms: number | null;
} {
  let priceOneRoom: number | null = null;
  let priceTwoRooms: number | null = null;
  let priceThreeRooms: number | null = null;

  for (const raw of aaData) {
    if (!Array.isArray(raw)) continue;
    if (hotelId != null && asNumber(raw, IDX.HOTEL_ID) !== hotelId) continue;

    const roomTypeId = asNumber(raw, IDX.ROOM_TYPE_ID);
    const price = asNumber(raw, IDX.PRICE);
    if (roomTypeId == null || price == null || price <= 0) continue;

    const room = catalog.get(roomTypeId);
    if (!room) continue;

    if (room.roomCount === 1) {
      if (priceOneRoom == null || price < priceOneRoom) priceOneRoom = price;
    } else if (room.roomCount === 2) {
      if (priceTwoRooms == null || price < priceTwoRooms) priceTwoRooms = price;
    } else if (room.roomCount === 3) {
      if (priceThreeRooms == null || price < priceThreeRooms) {
        priceThreeRooms = price;
      }
    }
  }

  return { priceOneRoom, priceTwoRooms, priceThreeRooms };
}

export function extractFromTourRows(
  payload: unknown,
  refererUrl = "",
  roomCatalog?: Map<number, RoomCatalogEntry>,
): {
  hotelId: number | null;
  name: string;
  pageUrl: string;
  photoUrl: string;
  latitude: number;
  longitude: number;
  priceOneRoom: number | null;
  priceTwoRooms: number | null;
  priceThreeRooms: number | null;
} {
  const root = payload as {
    GetToursResult?: { Data?: { aaData?: unknown[] } };
  };
  const aaData = root?.GetToursResult?.Data?.aaData;
  if (!Array.isArray(aaData) || aaData.length === 0) {
    throw new Error("No tour rows in response.");
  }
  const row = aaData[0];
  if (!Array.isArray(row) || row.length < 94) {
    throw new Error("Tour row is too short to read coordinates.");
  }

  const latitude = asNumber(row, IDX.LAT);
  const longitude = asNumber(row, IDX.LNG);
  if (latitude == null || longitude == null) {
    throw new Error("Could not read coordinates from tour row.");
  }

  const hotelId = asNumber(row, IDX.HOTEL_ID);
  const prices =
    roomCatalog && roomCatalog.size > 0
      ? cheapestPricesByRoomCount(aaData, hotelId, roomCatalog)
      : {
          priceOneRoom: null,
          priceTwoRooms: null,
          priceThreeRooms: null,
        };

  return {
    hotelId,
    name: asString(row, IDX.HOTEL_NAME) || "Hotel",
    pageUrl: pageUrlFromSlug(asString(row, IDX.HOTEL_SLUG), refererUrl),
    photoUrl: hotelPhotoUrl(hotelId, asString(row, IDX.PHOTO)),
    latitude,
    longitude,
    priceOneRoom: prices.priceOneRoom,
    priceTwoRooms: prices.priceTwoRooms,
    priceThreeRooms: prices.priceThreeRooms,
  };
}
