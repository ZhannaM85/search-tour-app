import type { HotelNote } from "./types";

const STORAGE_KEY = "hotel-shortlist.notes.v1";

export function loadNotes(): HotelNote[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as HotelNote[];
  } catch {
    return [];
  }
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
