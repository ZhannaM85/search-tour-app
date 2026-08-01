const IDX = {
  HOTEL_SLUG: 2,
  HOTEL_ID: 3,
  HOTEL_NAME: 7,
  /** Protocol-relative hotel thumbnail, e.g. `//host/i/p/{id}_30.jpg` */
  PHOTO: 29,
  LAT: 92,
  LNG: 93,
} as const;

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

export function extractFromTourRows(
  payload: unknown,
  refererUrl = "",
): {
  hotelId: number | null;
  name: string;
  pageUrl: string;
  photoUrl: string;
  latitude: number;
  longitude: number;
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
  return {
    hotelId,
    name: asString(row, IDX.HOTEL_NAME) || "Hotel",
    pageUrl: pageUrlFromSlug(asString(row, IDX.HOTEL_SLUG), refererUrl),
    photoUrl: hotelPhotoUrl(hotelId, asString(row, IDX.PHOTO)),
    latitude,
    longitude,
  };
}
