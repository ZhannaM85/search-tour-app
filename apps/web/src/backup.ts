import type { HotelNote, PriceHistoryEntry } from "./types";

export type ShortlistBackup = {
  version: 1;
  exportedAt: string;
  hotels: HotelNote[];
};

function isPriceHistoryEntry(value: unknown): value is PriceHistoryEntry {
  if (!value || typeof value !== "object") return false;
  const e = value as Record<string, unknown>;
  return (
    typeof e.price === "string" &&
    typeof e.capturedAt === "string" &&
    (e.operator === undefined || typeof e.operator === "string")
  );
}

function isHistoryArray(value: unknown): boolean {
  return value === undefined || (Array.isArray(value) && value.every(isPriceHistoryEntry));
}

function isHotelNote(value: unknown): value is HotelNote {
  if (!value || typeof value !== "object") return false;
  const n = value as Record<string, unknown>;
  return (
    typeof n.id === "string" &&
    typeof n.name === "string" &&
    typeof n.pageUrl === "string" &&
    typeof n.latitude === "number" &&
    typeof n.longitude === "number" &&
    typeof n.priceOneRoom === "string" &&
    typeof n.priceTwoRooms === "string" &&
    typeof n.notes === "string" &&
    typeof n.createdAt === "string" &&
    typeof n.updatedAt === "string" &&
    (n.hotelId === null || typeof n.hotelId === "number") &&
    (n.favorite === undefined || typeof n.favorite === "boolean") &&
    (n.disliked === undefined || typeof n.disliked === "boolean") &&
    (n.photoUrl === undefined || typeof n.photoUrl === "string") &&
    (n.priceThreeRooms === undefined || typeof n.priceThreeRooms === "string") &&
    (n.operatorOneRoom === undefined || typeof n.operatorOneRoom === "string") &&
    (n.operatorTwoRooms === undefined ||
      typeof n.operatorTwoRooms === "string") &&
    (n.operatorThreeRooms === undefined ||
      typeof n.operatorThreeRooms === "string") &&
    (n.tourRequestUrl === undefined || typeof n.tourRequestUrl === "string") &&
    (n.tourRefererUrl === undefined || typeof n.tourRefererUrl === "string") &&
    isHistoryArray(n.priceHistoryOneRoom) &&
    isHistoryArray(n.priceHistoryTwoRooms) &&
    isHistoryArray(n.priceHistoryThreeRooms) &&
    (n.stars === undefined ||
      n.stars === null ||
      typeof n.stars === "number") &&
    (n.rating === undefined ||
      n.rating === null ||
      typeof n.rating === "number") &&
    (n.reviewCount === undefined ||
      n.reviewCount === null ||
      typeof n.reviewCount === "number")
  );
}

function normalizeHistory(value: unknown): PriceHistoryEntry[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const e = item as PriceHistoryEntry;
    return {
      price: e.price,
      operator: typeof e.operator === "string" ? e.operator : "",
      capturedAt: e.capturedAt,
    };
  });
}

function withDefaults(notes: HotelNote[]): HotelNote[] {
  return notes.map((n) => ({
    ...n,
    favorite: Boolean(n.favorite),
    disliked: Boolean(n.disliked),
    photoUrl: typeof n.photoUrl === "string" ? n.photoUrl : "",
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
    stars: typeof n.stars === "number" && Number.isFinite(n.stars) ? n.stars : null,
    rating:
      typeof n.rating === "number" && Number.isFinite(n.rating) ? n.rating : null,
    reviewCount:
      typeof n.reviewCount === "number" && Number.isFinite(n.reviewCount)
        ? n.reviewCount
        : null,
  }));
}

export function parseBackupJson(text: string): HotelNote[] {
  const parsed: unknown = JSON.parse(text);

  // Full backup envelope
  if (parsed && typeof parsed === "object" && "hotels" in parsed) {
    const envelope = parsed as { version?: unknown; hotels?: unknown };
    if (!Array.isArray(envelope.hotels)) {
      throw new Error("Backup file is missing a hotels list.");
    }
    if (!envelope.hotels.every(isHotelNote)) {
      throw new Error("Backup file has invalid hotel entries.");
    }
    return withDefaults(envelope.hotels as HotelNote[]);
  }

  // Plain array (older / manual export)
  if (Array.isArray(parsed)) {
    if (!parsed.every(isHotelNote)) {
      throw new Error("Backup file has invalid hotel entries.");
    }
    return withDefaults(parsed as HotelNote[]);
  }

  throw new Error("Backup file format is not recognized.");
}

export function buildBackup(hotels: HotelNote[]): ShortlistBackup {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    hotels,
  };
}

export function downloadBackup(hotels: HotelNote[]): void {
  const backup = buildBackup(hotels);
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().slice(0, 10);
  const a = document.createElement("a");
  a.href = url;
  a.download = `hotel-shortlist-${stamp}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function readBackupFile(file: File): Promise<HotelNote[]> {
  const text = await file.text();
  return parseBackupJson(text);
}
