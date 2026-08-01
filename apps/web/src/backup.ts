import type { HotelNote } from "./types";

export type ShortlistBackup = {
  version: 1;
  exportedAt: string;
  hotels: HotelNote[];
};

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
    (n.hotelId === null || typeof n.hotelId === "number")
  );
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
    return envelope.hotels;
  }

  // Plain array (older / manual export)
  if (Array.isArray(parsed)) {
    if (!parsed.every(isHotelNote)) {
      throw new Error("Backup file has invalid hotel entries.");
    }
    return parsed;
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
