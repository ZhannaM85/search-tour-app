import { useMemo, useRef, useState } from "react";
import HotelsMap from "./HotelsMap";
import { parseTourCurl } from "./api";
import { downloadBackup, readBackupFile } from "./backup";
import { formatPrice, formatPriceInput, parsePriceDigits } from "./formatPrice";
import {
  loadNotes,
  newNoteId,
  removeNote,
  saveNotes,
  upsertNote,
} from "./storage";
import type { HotelNote } from "./types";

type FormState = {
  id: string | null;
  curl: string;
  name: string;
  pageUrl: string;
  hotelId: string;
  latitude: string;
  longitude: string;
  priceOneRoom: string;
  priceTwoRooms: string;
  notes: string;
};

const emptyForm = (): FormState => ({
  id: null,
  curl: "",
  name: "",
  pageUrl: "",
  hotelId: "",
  latitude: "",
  longitude: "",
  priceOneRoom: "",
  priceTwoRooms: "",
  notes: "",
});

export default function App() {
  const [notes, setNotes] = useState<HotelNote[]>(() => loadNotes());
  const [form, setForm] = useState<FormState>(emptyForm);
  const [status, setStatus] = useState("Paste a tours curl, then fill prices and notes.");
  const [busy, setBusy] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const sorted = useMemo(
    () => [...notes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [notes],
  );

  function persist(next: HotelNote[]) {
    setNotes(next);
    saveNotes(next);
  }

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleParseCurl() {
    setBusy(true);
    setStatus("Fetching tour data…");
    try {
      const parsed = await parseTourCurl(form.curl);
      setForm((f) => ({
        ...f,
        name: parsed.name,
        pageUrl: parsed.pageUrl || f.pageUrl,
        hotelId: parsed.hotelId != null ? String(parsed.hotelId) : "",
        latitude: String(parsed.latitude),
        longitude: String(parsed.longitude),
      }));
      setStatus(`Loaded “${parsed.name}” with map coordinates.`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function handleSave() {
    const lat = Number(form.latitude);
    const lng = Number(form.longitude);
    if (!form.name.trim()) {
      setStatus("Hotel name is required.");
      return;
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      setStatus("Parse a curl (or enter latitude/longitude) before saving.");
      return;
    }

    const now = new Date().toISOString();
    const id = form.id ?? newNoteId();
    const note: HotelNote = {
      id,
      hotelId: form.hotelId ? Number(form.hotelId) : null,
      name: form.name.trim(),
      pageUrl: form.pageUrl.trim(),
      latitude: lat,
      longitude: lng,
      priceOneRoom: form.priceOneRoom.trim(),
      priceTwoRooms: form.priceTwoRooms.trim(),
      notes: form.notes.trim(),
      createdAt: notes.find((n) => n.id === id)?.createdAt ?? now,
      updatedAt: now,
    };

    const next = upsertNote(notes, note);
    persist(next);
    setFocusId(id);
    setForm(emptyForm());
    setStatus(`Saved “${note.name}”.`);
  }

  function handleEdit(note: HotelNote) {
    setForm({
      id: note.id,
      curl: "",
      name: note.name,
      pageUrl: note.pageUrl,
      hotelId: note.hotelId != null ? String(note.hotelId) : "",
      latitude: String(note.latitude),
      longitude: String(note.longitude),
      priceOneRoom: note.priceOneRoom,
      priceTwoRooms: note.priceTwoRooms,
      notes: note.notes,
    });
    setFocusId(note.id);
    setStatus(`Editing “${note.name}”.`);
  }

  function handleDelete(id: string) {
    const note = notes.find((n) => n.id === id);
    if (!note) return;
    if (!confirm(`Remove “${note.name}”?`)) return;
    persist(removeNote(notes, id));
    if (form.id === id) setForm(emptyForm());
    setStatus(`Removed “${note.name}”.`);
  }

  function handleExport() {
    if (notes.length === 0) {
      setStatus("Nothing to export yet.");
      return;
    }
    downloadBackup(notes);
    setStatus(`Exported ${notes.length} hotel(s) to a JSON file.`);
  }

  async function handleImportFile(file: File | undefined) {
    if (!file) return;
    try {
      const imported = await readBackupFile(file);
      if (
        notes.length > 0 &&
        !confirm(
          `Replace your current shortlist (${notes.length}) with ${imported.length} hotel(s) from the file?`,
        )
      ) {
        setStatus("Import cancelled.");
        return;
      }
      persist(imported);
      setForm(emptyForm());
      setFocusId(null);
      setStatus(`Imported ${imported.length} hotel(s) from backup.`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    } finally {
      if (importInputRef.current) importInputRef.current.value = "";
    }
  }

  return (
    <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-2">
      <div className="space-y-6">
        <header>
          <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">
            Personal shortlist
          </p>
          <h1 className="mt-1 text-3xl font-bold text-slate-900">
            Hotel shortlist
          </h1>
          <p className="mt-2 text-slate-600">
            You curate hotels after checking them yourself. Paste a tours curl to
            fill name and coordinates, then add prices and notes.
          </p>
        </header>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">
            {form.id ? "Edit hotel" : "Add hotel"}
          </h2>

          <label className="mt-4 block text-sm font-medium text-slate-700">
            Tours curl (Copy as cURL from the hotel page)
            <textarea
              className="mt-1 h-28 w-full rounded-xl border border-slate-300 bg-slate-50 p-3 font-mono text-xs"
              value={form.curl}
              onChange={(e) => setField("curl", e.target.value)}
              placeholder="curl &quot;https://…&quot; …"
            />
          </label>

          <button
            type="button"
            disabled={busy || !form.curl.trim()}
            onClick={handleParseCurl}
            className="mt-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
          >
            {busy ? "Loading…" : "Load name & coordinates"}
          </button>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium text-slate-700 sm:col-span-2">
              Hotel name
              <input
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                value={form.name}
                onChange={(e) => setField("name", e.target.value)}
              />
            </label>

            <label className="block text-sm font-medium text-slate-700 sm:col-span-2">
              Hotel page URL
              <input
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                value={form.pageUrl}
                onChange={(e) => setField("pageUrl", e.target.value)}
              />
            </label>

            <label className="block text-sm font-medium text-slate-700">
              Latitude
              <input
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                value={form.latitude}
                onChange={(e) => setField("latitude", e.target.value)}
              />
            </label>

            <label className="block text-sm font-medium text-slate-700">
              Longitude
              <input
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                value={form.longitude}
                onChange={(e) => setField("longitude", e.target.value)}
              />
            </label>

            <label className="block text-sm font-medium text-slate-700">
              Price — 1 room
              <div className="relative mt-1">
                <input
                  inputMode="numeric"
                  className="w-full rounded-xl border border-slate-300 py-2 pl-3 pr-8"
                  value={formatPriceInput(form.priceOneRoom)}
                  onChange={(e) =>
                    setField("priceOneRoom", parsePriceDigits(e.target.value))
                  }
                  placeholder="280 000"
                />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-slate-400">
                  ₽
                </span>
              </div>
            </label>

            <label className="block text-sm font-medium text-slate-700">
              Price — 2 rooms
              <div className="relative mt-1">
                <input
                  inputMode="numeric"
                  className="w-full rounded-xl border border-slate-300 py-2 pl-3 pr-8"
                  value={formatPriceInput(form.priceTwoRooms)}
                  onChange={(e) =>
                    setField("priceTwoRooms", parsePriceDigits(e.target.value))
                  }
                  placeholder="360 000"
                />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-slate-400">
                  ₽
                </span>
              </div>
            </label>

            <label className="block text-sm font-medium text-slate-700 sm:col-span-2">
              Your notes
              <textarea
                className="mt-1 h-28 w-full rounded-xl border border-slate-300 px-3 py-2"
                value={form.notes}
                onChange={(e) => setField("notes", e.target.value)}
                placeholder="Room name, dates, operator, what you liked…"
              />
            </label>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleSave}
              className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700"
            >
              {form.id ? "Update" : "Save to shortlist"}
            </button>
            {form.id ? (
              <button
                type="button"
                onClick={() => {
                  setForm(emptyForm());
                  setStatus("Form cleared.");
                }}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm"
              >
                Cancel edit
              </button>
            ) : null}
          </div>

          <p className="mt-3 text-sm text-slate-600">{status}</p>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-slate-900">
              Saved hotels ({sorted.length})
            </h2>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleExport}
                className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-50"
              >
                Export
              </button>
              <button
                type="button"
                onClick={() => importInputRef.current?.click()}
                className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-50"
              >
                Import
              </button>
              <input
                ref={importInputRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => handleImportFile(e.target.files?.[0])}
              />
            </div>
          </div>
          {sorted.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">
              None yet. Export downloads a backup JSON; Import restores it.
            </p>
          ) : (
            <ul className="mt-3 space-y-3">
              {sorted.map((n) => (
                <li
                  key={n.id}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <button
                        type="button"
                        className="text-left font-semibold text-teal-800 hover:underline"
                        onClick={() => setFocusId(n.id)}
                      >
                        {n.name}
                      </button>
                      <div className="mt-1 text-sm text-slate-600">
                        {n.priceOneRoom
                          ? `1 room: ${formatPrice(n.priceOneRoom)}`
                          : null}
                        {n.priceOneRoom && n.priceTwoRooms ? " · " : null}
                        {n.priceTwoRooms
                          ? `2 rooms: ${formatPrice(n.priceTwoRooms)}`
                          : null}
                      </div>
                      {n.notes ? (
                        <p className="mt-1 text-sm text-slate-700">{n.notes}</p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-col gap-1">
                      <button
                        type="button"
                        className="text-xs text-slate-600 hover:underline"
                        onClick={() => handleEdit(n)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="text-xs text-rose-600 hover:underline"
                        onClick={() => handleDelete(n.id)}
                      >
                        Delete
                      </button>
                      {n.pageUrl ? (
                        <a
                          className="text-xs text-teal-700 hover:underline"
                          href={n.pageUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open
                        </a>
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="h-[min(80vh,720px)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <HotelsMap notes={notes} focusId={focusId} />
      </section>
    </div>
  );
}
