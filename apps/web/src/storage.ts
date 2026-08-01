import type { HotelNote } from "./types";

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
    notes: typeof n.notes === "string" ? n.notes : "",
    favorite: Boolean(n.favorite),
    createdAt: typeof n.createdAt === "string" ? n.createdAt : new Date().toISOString(),
    updatedAt: typeof n.updatedAt === "string" ? n.updatedAt : new Date().toISOString(),
  };
}

export function saveNotes(notes: HotelNote[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
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
