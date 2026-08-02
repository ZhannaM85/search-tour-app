import type { HotelNote, PriceHistoryEntry } from "./types";

const STORAGE_KEY = "hotel-shortlist.notes.v1";

export function loadNotes(): HotelNote[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeNote).filter((n): n is HotelNote => n != null);
  } catch {
    return [];
  }
}

function normalizeHistory(value: unknown): PriceHistoryEntry[] {
  if (!Array.isArray(value)) return [];
  const out: PriceHistoryEntry[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const e = item as Record<string, unknown>;
    if (typeof e.price !== "string" || typeof e.capturedAt !== "string") {
      continue;
    }
    out.push({
      price: e.price,
      operator: typeof e.operator === "string" ? e.operator : "",
      capturedAt: e.capturedAt,
    });
  }
  return out;
}

function normalizeNote(value: unknown): HotelNote | null {
  if (!value || typeof value !== "object") return null;
  const n = value as Partial<HotelNote> & Record<string, unknown>;
  if (typeof n.id !== "string" || typeof n.name !== "string") return null;
  if (typeof n.latitude !== "number" || typeof n.longitude !== "number") {
    return null;
  }
  return {
    id: n.id,
    hotelId: typeof n.hotelId === "number" ? n.hotelId : null,
    name: n.name,
    pageUrl: typeof n.pageUrl === "string" ? n.pageUrl : "",
    photoUrl: typeof n.photoUrl === "string" ? n.photoUrl : "",
    latitude: n.latitude,
    longitude: n.longitude,
    priceOneRoom: typeof n.priceOneRoom === "string" ? n.priceOneRoom : "",
    priceTwoRooms: typeof n.priceTwoRooms === "string" ? n.priceTwoRooms : "",
    priceThreeRooms:
      typeof n.priceThreeRooms === "string" ? n.priceThreeRooms : "",
    operatorOneRoom:
      typeof n.operatorOneRoom === "string" ? n.operatorOneRoom : "",
    operatorTwoRooms:
      typeof n.operatorTwoRooms === "string" ? n.operatorTwoRooms : "",
    operatorThreeRooms:
      typeof n.operatorThreeRooms === "string" ? n.operatorThreeRooms : "",
    tourRequestUrl: typeof n.tourRequestUrl === "string" ? n.tourRequestUrl : "",
    tourRefererUrl: typeof n.tourRefererUrl === "string" ? n.tourRefererUrl : "",
    priceHistoryOneRoom: normalizeHistory(n.priceHistoryOneRoom),
    priceHistoryTwoRooms: normalizeHistory(n.priceHistoryTwoRooms),
    priceHistoryThreeRooms: normalizeHistory(n.priceHistoryThreeRooms),
    notes: typeof n.notes === "string" ? n.notes : "",
    favorite: Boolean(n.favorite),
    createdAt: typeof n.createdAt === "string" ? n.createdAt : new Date().toISOString(),
    updatedAt: typeof n.updatedAt === "string" ? n.updatedAt : new Date().toISOString(),
  };
}

export function saveNotes(notes: HotelNote[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
}

export function findNoteByHotelId(
  notes: HotelNote[],
  hotelId: number,
): HotelNote | undefined {
  return notes.find((n) => n.hotelId === hotelId);
}

/** Match an existing shortlist hotel: hotelId first, then pageUrl, then name+coords. */
export function findDuplicateHotel(
  notes: HotelNote[],
  candidate: {
    hotelId?: number | null;
    pageUrl?: string;
    name?: string;
    latitude?: number;
    longitude?: number;
  },
): HotelNote | undefined {
  const hotelId =
    candidate.hotelId != null && Number.isFinite(candidate.hotelId)
      ? candidate.hotelId
      : null;
  if (hotelId != null) {
    const byId = findNoteByHotelId(notes, hotelId);
    if (byId) return byId;
  }

  const pageUrl = normalizePageUrl(candidate.pageUrl);
  if (pageUrl) {
    const byUrl = notes.find((n) => normalizePageUrl(n.pageUrl) === pageUrl);
    if (byUrl) return byUrl;
  }

  const name = candidate.name?.trim().toLowerCase();
  const lat = candidate.latitude;
  const lng = candidate.longitude;
  if (
    name &&
    lat != null &&
    lng != null &&
    Number.isFinite(lat) &&
    Number.isFinite(lng)
  ) {
    return notes.find(
      (n) =>
        n.name.trim().toLowerCase() === name &&
        sameCoord(n.latitude, lat) &&
        sameCoord(n.longitude, lng),
    );
  }

  return undefined;
}

function normalizePageUrl(url: string | undefined): string {
  if (!url?.trim()) return "";
  try {
    const u = new URL(url.trim());
    return `${u.origin}${u.pathname}`.replace(/\/+$/, "").toLowerCase();
  } catch {
    return url.trim().replace(/\/+$/, "").toLowerCase();
  }
}

function sameCoord(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-5;
}

export function upsertNote(notes: HotelNote[], note: HotelNote): HotelNote[] {
  const idx = notes.findIndex((n) => n.id === note.id);
  if (idx === -1) return [...notes, note];
  const next = [...notes];
  next[idx] = note;
  return next;
}

export function removeNote(notes: HotelNote[], id: string): HotelNote[] {
  return notes.filter((n) => n.id !== id);
}

export function newNoteId(): string {
  return crypto.randomUUID();
}
