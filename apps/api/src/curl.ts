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
  /** System meal id (legacy referer `mealsIds`; not used for price selection). */
  MEAL_ID: 41,
  /** Promo/net price — never used for display (see FULL_PRICE). */
  PRICE: 42,
  /** System room-type id — joins to hotel page `rooms[].id`. */
  ROOM_TYPE_ID: 44,
  /**
   * Full tour price — the only amount we display. Never fall back to PRICE
   * (`[42]`); rows with full == 0 are skipped.
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

/** Star category, guest rating, and review count from hotel page SSR. */
export type HotelQualitySignals = {
  /** Star category as a number (e.g. 5 from `"5*"`). */
  stars: number | null;
  /** Guest rating (e.g. 9.58). */
  rating: number | null;
  /** Number of reviews / votes (e.g. 388). */
  reviewCount: number | null;
};

export type HotelPageExtract = HotelQualitySignals & {
  rooms: Map<number, RoomCatalogEntry>;
};

function emptyHotelPageExtract(): HotelPageExtract {
  return {
    rooms: new Map(),
    stars: null,
    rating: null,
    reviewCount: null,
  };
}

/** Parse `"5*"` / `"5★"` / `5` into a star count. */
function parseStarCategory(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
    return Math.round(raw);
  }
  if (typeof raw !== "string") return null;
  const m = raw.trim().match(/^(\d+)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

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

/**
 * Start a new GetTours search the way the hotel page does: `requestId=0`
 * (no `updateResult`). Response Data.requestId is then used to poll results.
 */
export function toCreateSearchUrl(storedRequestUrl: string): string {
  const u = new URL(storedRequestUrl);
  u.searchParams.set("requestId", "0");
  u.searchParams.delete("updateResult");
  return u.toString();
}

/** Poll results for an active search (`requestId` + `updateResult=1`). */
export function toPollSearchUrl(
  storedRequestUrl: string,
  requestId: number | string,
): string {
  const u = new URL(storedRequestUrl);
  u.searchParams.set("requestId", String(requestId));
  u.searchParams.set("updateResult", "1");
  return u.toString();
}

/** Read Data.requestId from a GetTours JSON payload (> 0 only). */
export function readGetToursRequestId(payload: unknown): number | null {
  const root = payload as {
    GetToursResult?: { Data?: { requestId?: unknown }; IsError?: boolean };
  };
  if (root?.GetToursResult?.IsError) return null;
  const raw = root?.GetToursResult?.Data?.requestId;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function getToursAaData(payload: unknown): unknown[] | null {
  const root = payload as {
    GetToursResult?: { Data?: { aaData?: unknown } };
  };
  const aaData = root?.GetToursResult?.Data?.aaData;
  return Array.isArray(aaData) ? aaData : null;
}

/**
 * True when GetTours `loadState` lists operators and every one is processed.
 * Prefer waiting for this over returning on the first non-empty `aaData`
 * (early rows can omit operators that still change the cheapest price).
 */
export function toursLoadComplete(payload: unknown): boolean {
  const root = payload as {
    GetToursResult?: { Data?: { loadState?: unknown } };
  };
  const loadState = root?.GetToursResult?.Data?.loadState;
  if (!Array.isArray(loadState) || loadState.length === 0) return false;
  return loadState.every(
    (op) =>
      op != null &&
      typeof op === "object" &&
      (op as { IsProcessed?: unknown }).IsProcessed === true,
  );
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
 * Hotel details (rooms + quality signals) are SSR'd into the hotel page as
 * `window.__INITIAL_STATE__.pageModel.hotelDetails` — not a Network XHR.
 *
 * Rooms: `id` joins GetTours aaData[44], `roomCount` is 1/2/3.
 * Quality: `category.name` (e.g. `"5*"`), `rate`, `reviewCount`.
 * GetTours aaData does not carry these quality fields in a mapped IDX column.
 */
export function extractHotelPageDataFromHtml(html: string): HotelPageExtract {
  const out = emptyHotelPageExtract();
  const match = html.match(
    /window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\})\s*;?\s*<\/script>/,
  );
  if (!match) return out;

  let state: unknown;
  try {
    state = JSON.parse(match[1]);
  } catch {
    return out;
  }

  const hotelDetails = (
    state as {
      pageModel?: {
        hotelDetails?: {
          rooms?: unknown;
          category?: { name?: unknown } | null;
          rate?: unknown;
          reviewCount?: unknown;
        };
      };
    }
  )?.pageModel?.hotelDetails;

  if (!hotelDetails) return out;

  const categoryName = hotelDetails.category?.name;
  out.stars = parseStarCategory(categoryName);

  const rate =
    typeof hotelDetails.rate === "number"
      ? hotelDetails.rate
      : Number(hotelDetails.rate);
  out.rating = Number.isFinite(rate) && rate > 0 ? rate : null;

  const reviewCount =
    typeof hotelDetails.reviewCount === "number"
      ? hotelDetails.reviewCount
      : Number(hotelDetails.reviewCount);
  out.reviewCount =
    Number.isFinite(reviewCount) && reviewCount >= 0
      ? Math.round(reviewCount)
      : null;

  const rooms = hotelDetails.rooms;
  if (!Array.isArray(rooms)) return out;

  for (const room of rooms) {
    if (!room || typeof room !== "object") continue;
    const r = room as Record<string, unknown>;
    const id = typeof r.id === "number" ? r.id : Number(r.id);
    const roomCount =
      typeof r.roomCount === "number" ? r.roomCount : Number(r.roomCount);
    if (!Number.isFinite(id) || !Number.isFinite(roomCount) || roomCount < 1) {
      continue;
    }
    out.rooms.set(id, {
      id,
      name: r.name == null ? "" : String(r.name),
      roomCount,
    });
  }
  return out;
}

export function extractRoomCatalogFromHtml(
  html: string,
): Map<number, RoomCatalogEntry> {
  return extractHotelPageDataFromHtml(html).rooms;
}

type PriceWithOperator = {
  price: number | null;
  operator: string | null;
  roomName: string | null;
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

/** Full price `[88]` only — never promo `[42]`. */
function tourPrice(row: unknown[]): number | null {
  const full = asNumber(row, IDX.FULL_PRICE);
  if (full != null && full > 0) return full;
  return null;
}

export type RoomCountPrices = {
  priceOneRoom: number | null;
  priceTwoRooms: number | null;
  priceThreeRooms: number | null;
  operatorOneRoom: string | null;
  operatorTwoRooms: string | null;
  operatorThreeRooms: string | null;
  roomNameOneRoom: string | null;
  roomNameTwoRooms: string | null;
  roomNameThreeRooms: string | null;
};

function emptyRoomCountPrices(): RoomCountPrices {
  return {
    priceOneRoom: null,
    priceTwoRooms: null,
    priceThreeRooms: null,
    operatorOneRoom: null,
    operatorTwoRooms: null,
    operatorThreeRooms: null,
    roomNameOneRoom: null,
    roomNameTwoRooms: null,
    roomNameThreeRooms: null,
  };
}

/**
 * Cheapest full `[88]` price per room count. Skips untyped rooms (`id <= 0`)
 * and does not apply referer operator/meal filters.
 */
function cheapestPricesByRoomCount(
  aaData: unknown[],
  hotelId: number | null,
  catalog: Map<number, RoomCatalogEntry>,
): RoomCountPrices {
  const one: PriceWithOperator = { price: null, operator: null, roomName: null };
  const two: PriceWithOperator = { price: null, operator: null, roomName: null };
  const three: PriceWithOperator = {
    price: null,
    operator: null,
    roomName: null,
  };

  for (const raw of aaData) {
    if (!Array.isArray(raw)) continue;
    if (hotelId != null && asNumber(raw, IDX.HOTEL_ID) !== hotelId) continue;

    const roomTypeId = asNumber(raw, IDX.ROOM_TYPE_ID);
    const price = tourPrice(raw);
    // Room type 0 = untyped offer — not a sletat room group; never win a slot.
    if (roomTypeId == null || roomTypeId <= 0 || price == null) continue;

    const room = catalog.get(roomTypeId);
    if (!room) continue;

    const operator = asString(raw, IDX.OPERATOR_NAME).trim() || null;
    const roomName = room.name.trim() || null;
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
      slot.roomName = roomName;
    }
  }

  return {
    priceOneRoom: one.price,
    priceTwoRooms: two.price,
    priceThreeRooms: three.price,
    operatorOneRoom: one.operator,
    operatorTwoRooms: two.operator,
    operatorThreeRooms: three.operator,
    roomNameOneRoom: one.roomName,
    roomNameTwoRooms: two.roomName,
    roomNameThreeRooms: three.roomName,
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
} & RoomCountPrices {
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
      : emptyRoomCountPrices();

  return {
    hotelId,
    name: asString(row, IDX.HOTEL_NAME) || "Hotel",
    pageUrl: pageUrlFromSlug(asString(row, IDX.HOTEL_SLUG), refererUrl),
    photoUrl: hotelPhotoUrl(hotelId, asString(row, IDX.PHOTO)),
    latitude,
    longitude,
    ...prices,
  };
}
