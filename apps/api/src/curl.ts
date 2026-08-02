const IDX = {
  /** Encrypted / numeric tour-operator id (e.g. 7 = Biblio Globus, 19 = Anex). */
  OPERATOR_ID: 1,
  HOTEL_SLUG: 2,
  HOTEL_ID: 3,
  HOTEL_NAME: 7,
  /** Tour operator display name (e.g. "Biblio Globus", "Anex"). */
  OPERATOR_NAME: 18,
  /** Protocol-relative hotel thumbnail, e.g. `//host/i/p/{id}_30.jpg` */
  PHOTO: 29,
  /** System meal id (joins referer `mealsIds`). */
  MEAL_ID: 41,
  /** Tour price number (often promo/net; may be lower than the site button). */
  PRICE: 42,
  /** System room-type id — joins to hotel page `rooms[].id`. */
  ROOM_TYPE_ID: 44,
  /**
   * Full tour price incl. operator fees — matches the amount shown on sletat.ru.
   * Prefer this over PRICE when > 0 (promo rows differ: 42 < 88). When 0, the
   * site typically does not show that offer's net price as the button amount.
   */
  FULL_PRICE: 88,
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

type PriceWithOperator = {
  price: number | null;
  operator: string | null;
};

export type TourPriceFilters = {
  /** From referer `operatorIds` — when set, only these operators. */
  operatorIds?: Set<number>;
  /** From referer `mealsIds` — when set, only these meal ids. */
  mealIds?: Set<number>;
};

/** Parse `operatorIds` / `mealsIds` from the hotel-page search referer. */
export function parseRefererPriceFilters(refererUrl: string): TourPriceFilters {
  const out: TourPriceFilters = {};
  if (!refererUrl) return out;
  try {
    const u = new URL(refererUrl);
    const operators = u.searchParams.get("operatorIds");
    if (operators) {
      const ids = operators
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n));
      if (ids.length) out.operatorIds = new Set(ids);
    }
    const meals = u.searchParams.get("mealsIds");
    if (meals) {
      const ids = meals
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n));
      if (ids.length) out.mealIds = new Set(ids);
    }
  } catch {
    /* ignore bad referer */
  }
  return out;
}

/**
 * Prefer full site price `[88]` when > 0.
 * If `[88]` is explicitly 0, skip (net/promo-only row not shown as the button).
 * Otherwise fall back to `[42]`.
 */
function tourPrice(row: unknown[]): number | null {
  const full = asNumber(row, IDX.FULL_PRICE);
  if (full != null && full > 0) return full;
  if (full === 0) return null;
  const price = asNumber(row, IDX.PRICE);
  if (price != null && price > 0) return price;
  return null;
}

function cheapestPricesByRoomCount(
  aaData: unknown[],
  hotelId: number | null,
  catalog: Map<number, RoomCatalogEntry>,
  filters: TourPriceFilters = {},
): {
  priceOneRoom: number | null;
  priceTwoRooms: number | null;
  priceThreeRooms: number | null;
  operatorOneRoom: string | null;
  operatorTwoRooms: string | null;
  operatorThreeRooms: string | null;
} {
  const one: PriceWithOperator = { price: null, operator: null };
  const two: PriceWithOperator = { price: null, operator: null };
  const three: PriceWithOperator = { price: null, operator: null };

  for (const raw of aaData) {
    if (!Array.isArray(raw)) continue;
    if (hotelId != null && asNumber(raw, IDX.HOTEL_ID) !== hotelId) continue;

    if (filters.operatorIds && filters.operatorIds.size > 0) {
      const opId = asNumber(raw, IDX.OPERATOR_ID);
      if (opId == null || !filters.operatorIds.has(opId)) continue;
    }
    if (filters.mealIds && filters.mealIds.size > 0) {
      const mealId = asNumber(raw, IDX.MEAL_ID);
      if (mealId == null || !filters.mealIds.has(mealId)) continue;
    }

    const roomTypeId = asNumber(raw, IDX.ROOM_TYPE_ID);
    const price = tourPrice(raw);
    if (roomTypeId == null || price == null) continue;

    const room = catalog.get(roomTypeId);
    if (!room) continue;

    const operator = asString(raw, IDX.OPERATOR_NAME).trim() || null;
    const slot =
      room.roomCount === 1
        ? one
        : room.roomCount === 2
          ? two
          : room.roomCount === 3
            ? three
            : null;
    if (!slot) continue;
    if (slot.price == null || price < slot.price) {
      slot.price = price;
      slot.operator = operator;
    }
  }

  return {
    priceOneRoom: one.price,
    priceTwoRooms: two.price,
    priceThreeRooms: three.price,
    operatorOneRoom: one.operator,
    operatorTwoRooms: two.operator,
    operatorThreeRooms: three.operator,
  };
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
  operatorOneRoom: string | null;
  operatorTwoRooms: string | null;
  operatorThreeRooms: string | null;
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
  const filters = parseRefererPriceFilters(refererUrl);
  const prices =
    roomCatalog && roomCatalog.size > 0
      ? cheapestPricesByRoomCount(aaData, hotelId, roomCatalog, filters)
      : {
          priceOneRoom: null,
          priceTwoRooms: null,
          priceThreeRooms: null,
          operatorOneRoom: null,
          operatorTwoRooms: null,
          operatorThreeRooms: null,
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
    operatorOneRoom: prices.operatorOneRoom,
    operatorTwoRooms: prices.operatorTwoRooms,
    operatorThreeRooms: prices.operatorThreeRooms,
  };
}
