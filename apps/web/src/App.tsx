import { useMemo, useRef, useState, type ReactNode } from "react";
import ConfirmDialog from "./ConfirmDialog";
import HotelsMap from "./HotelsMap";
import OperatorField from "./OperatorField";
import PencilIcon from "./PencilIcon";
import RefreshIcon from "./RefreshIcon";
import ExternalLinkIcon from "./ExternalLinkIcon";
import StarIcon from "./StarIcon";
import TrashIcon from "./TrashIcon";
import { parseTourCurl, refreshHotelPrices } from "./api";
import { downloadBackup, readBackupFile } from "./backup";
import { formatPrice, formatPriceInput, parsePriceDigits } from "./formatPrice";
import { fillMissingPhotos, photoUrlFromHotelId } from "./photoUrl";
import { sortHotels, type SortMode } from "./sortHotels";
import {
  findDuplicateHotel,
  loadNotes,
  newNoteId,
  removeNote,
  saveNotes,
  upsertNote,
} from "./storage";
import type { HotelNote, PriceHistoryEntry } from "./types";
import { formatHotelQuality, prependPriceHistory } from "./types";

type FormState = {
  id: string | null;
  curl: string;
  name: string;
  pageUrl: string;
  photoUrl: string;
  hotelId: string;
  latitude: string;
  longitude: string;
  priceOneRoom: string;
  priceTwoRooms: string;
  priceThreeRooms: string;
  operatorOneRoom: string;
  operatorTwoRooms: string;
  operatorThreeRooms: string;
  tourRequestUrl: string;
  tourRefererUrl: string;
  priceHistoryOneRoom: PriceHistoryEntry[];
  priceHistoryTwoRooms: PriceHistoryEntry[];
  priceHistoryThreeRooms: PriceHistoryEntry[];
  stars: number | null;
  rating: number | null;
  reviewCount: number | null;
  notes: string;
  favorite: boolean;
};

const emptyForm = (): FormState => ({
  id: null,
  curl: "",
  name: "",
  pageUrl: "",
  photoUrl: "",
  hotelId: "",
  latitude: "",
  longitude: "",
  priceOneRoom: "",
  priceTwoRooms: "",
  priceThreeRooms: "",
  operatorOneRoom: "",
  operatorTwoRooms: "",
  operatorThreeRooms: "",
  tourRequestUrl: "",
  tourRefererUrl: "",
  priceHistoryOneRoom: [],
  priceHistoryTwoRooms: [],
  priceHistoryThreeRooms: [],
  stars: null,
  rating: null,
  reviewCount: null,
  notes: "",
  favorite: false,
});

type PriceFlash = {
  one?: { from: string; to: string };
  two?: { from: string; to: string };
  three?: { from: string; to: string };
};

/** Fields compared for dirty Cancel-edit (#5). Ignores curl. */
type EditBaseline = {
  name: string;
  pageUrl: string;
  priceOneRoom: string;
  priceTwoRooms: string;
  priceThreeRooms: string;
  operatorOneRoom: string;
  operatorTwoRooms: string;
  operatorThreeRooms: string;
  notes: string;
  favorite: boolean;
};

function snapshotEditBaseline(f: FormState): EditBaseline {
  return {
    name: f.name,
    pageUrl: f.pageUrl,
    priceOneRoom: f.priceOneRoom,
    priceTwoRooms: f.priceTwoRooms,
    priceThreeRooms: f.priceThreeRooms,
    operatorOneRoom: f.operatorOneRoom,
    operatorTwoRooms: f.operatorTwoRooms,
    operatorThreeRooms: f.operatorThreeRooms,
    notes: f.notes,
    favorite: f.favorite,
  };
}

function isEditDirty(form: FormState, baseline: EditBaseline | null): boolean {
  if (!form.id || !baseline) return false;
  return (
    form.name !== baseline.name ||
    form.pageUrl !== baseline.pageUrl ||
    form.priceOneRoom !== baseline.priceOneRoom ||
    form.priceTwoRooms !== baseline.priceTwoRooms ||
    form.priceThreeRooms !== baseline.priceThreeRooms ||
    form.operatorOneRoom !== baseline.operatorOneRoom ||
    form.operatorTwoRooms !== baseline.operatorTwoRooms ||
    form.operatorThreeRooms !== baseline.operatorThreeRooms ||
    form.notes !== baseline.notes ||
    form.favorite !== baseline.favorite
  );
}

function formatPriceWithOperator(price: string, operator: string): string {
  const formatted = formatPrice(price);
  const op = operator.trim();
  return op ? `${formatted} (${op})` : formatted;
}

function formatHistoryWasLine(note: HotelNote): string | null {
  const bits: string[] = [];
  const h1 = note.priceHistoryOneRoom[0];
  const h2 = note.priceHistoryTwoRooms[0];
  const h3 = note.priceHistoryThreeRooms[0];
  if (h1) bits.push(`1 room ${formatPriceWithOperator(h1.price, h1.operator)}`);
  if (h2) bits.push(`2 rooms ${formatPriceWithOperator(h2.price, h2.operator)}`);
  if (h3) bits.push(`3 rooms ${formatPriceWithOperator(h3.price, h3.operator)}`);
  return bits.length ? `Was: ${bits.join(" · ")}` : null;
}

function formatPriceSlot(
  label: string,
  price: string,
  operator: string,
  flash?: { from: string; to: string },
): ReactNode {
  if (!price && !flash) return null;
  if (flash) {
    return (
      <span key={label}>
        {label}:{" "}
        <span className="text-slate-400 line-through">
          {formatPrice(flash.from)}
        </span>
        {" → "}
        <span className="font-medium text-slate-800">
          {formatPriceWithOperator(flash.to, operator)}
        </span>
      </span>
    );
  }
  return (
    <span key={label}>
      {label}: {formatPriceWithOperator(price, operator)}
    </span>
  );
}

function bootstrapNotes(): { notes: HotelNote[]; filled: number } {
  const loaded = loadNotes();
  const { notes, filled } = fillMissingPhotos(loaded);
  if (filled > 0) saveNotes(notes as HotelNote[]);
  return { notes: notes as HotelNote[], filled };
}

const initialBoot = bootstrapNotes();

export default function App() {
  const [notes, setNotes] = useState<HotelNote[]>(initialBoot.notes);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [status, setStatus] = useState(
    initialBoot.filled > 0
      ? `Restored photos for ${initialBoot.filled} previously saved hotel(s).`
      : "Paste a tours curl, then fill prices and notes.",
  );
  const [busy, setBusy] = useState(false);
  /** Bumps when form is reset or operators are (re)loaded from the API — locks operator fields. */
  const [operatorLockKey, setOperatorLockKey] = useState(0);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [focusNonce, setFocusNonce] = useState(0);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("recent");
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [priceFlashById, setPriceFlashById] = useState<
    Record<string, PriceFlash>
  >({});
  const [deleteConfirm, setDeleteConfirm] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [cancelEditConfirm, setCancelEditConfirm] = useState(false);
  const [editBaseline, setEditBaseline] = useState<EditBaseline | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const sorted = useMemo(() => {
    const list = favoritesOnly ? notes.filter((n) => n.favorite) : notes;
    return sortHotels(list, sortMode);
  }, [notes, favoritesOnly, sortMode]);

  /** Map popup reads saved notes; while editing, overlay form quality so rating matches the form. */
  const mapNotes = useMemo(() => {
    if (!form.id) return sorted;
    return sorted.map((n) =>
      n.id === form.id
        ? {
            ...n,
            stars: form.stars,
            rating: form.rating,
            reviewCount: form.reviewCount,
          }
        : n,
    );
  }, [sorted, form.id, form.stars, form.rating, form.reviewCount]);

  const favoriteCount = useMemo(
    () => notes.filter((n) => n.favorite).length,
    [notes],
  );

  function selectHotel(id: string) {
    setFocusId(id);
    setFocusNonce((n) => n + 1);
  }

  /** List click: select, or click again to clear. */
  function toggleFocusHotel(id: string) {
    if (focusId === id) {
      setFocusId(null);
      return;
    }
    selectHotel(id);
  }

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
      const duplicate = findDuplicateHotel(notes, {
        hotelId: parsed.hotelId,
        pageUrl: parsed.pageUrl,
        name: parsed.name,
        latitude: parsed.latitude,
        longitude: parsed.longitude,
      });
      const f = form;
      const next: FormState = {
        ...f,
        // Already shortlisted → edit that entry (keep notes/favorite).
        id: duplicate?.id ?? null,
        name: parsed.name,
        pageUrl: parsed.pageUrl || f.pageUrl,
        photoUrl: parsed.photoUrl || duplicate?.photoUrl || f.photoUrl,
        hotelId: parsed.hotelId != null ? String(parsed.hotelId) : "",
        latitude: String(parsed.latitude),
        longitude: String(parsed.longitude),
        priceOneRoom:
          parsed.priceOneRoom != null
            ? String(parsed.priceOneRoom)
            : (duplicate?.priceOneRoom ?? f.priceOneRoom),
        priceTwoRooms:
          parsed.priceTwoRooms != null
            ? String(parsed.priceTwoRooms)
            : (duplicate?.priceTwoRooms ?? f.priceTwoRooms),
        priceThreeRooms:
          parsed.priceThreeRooms != null
            ? String(parsed.priceThreeRooms)
            : (duplicate?.priceThreeRooms ?? f.priceThreeRooms),
        operatorOneRoom:
          parsed.priceOneRoom != null
            ? (parsed.operatorOneRoom ?? "")
            : (duplicate?.operatorOneRoom ?? f.operatorOneRoom),
        operatorTwoRooms:
          parsed.priceTwoRooms != null
            ? (parsed.operatorTwoRooms ?? "")
            : (duplicate?.operatorTwoRooms ?? f.operatorTwoRooms),
        operatorThreeRooms:
          parsed.priceThreeRooms != null
            ? (parsed.operatorThreeRooms ?? "")
            : (duplicate?.operatorThreeRooms ?? f.operatorThreeRooms),
        tourRequestUrl: parsed.requestUrl ?? f.tourRequestUrl,
        tourRefererUrl: parsed.refererUrl ?? f.tourRefererUrl,
        priceHistoryOneRoom:
          duplicate?.priceHistoryOneRoom ?? f.priceHistoryOneRoom,
        priceHistoryTwoRooms:
          duplicate?.priceHistoryTwoRooms ?? f.priceHistoryTwoRooms,
        priceHistoryThreeRooms:
          duplicate?.priceHistoryThreeRooms ?? f.priceHistoryThreeRooms,
        stars: parsed.stars ?? duplicate?.stars ?? null,
        rating: parsed.rating ?? duplicate?.rating ?? null,
        reviewCount: parsed.reviewCount ?? duplicate?.reviewCount ?? null,
        notes: duplicate?.notes ?? f.notes,
        favorite: duplicate?.favorite ?? f.favorite,
      };
      setForm(next);
      setEditBaseline(duplicate ? snapshotEditBaseline(next) : null);
      setCancelEditConfirm(false);
      setOperatorLockKey((k) => k + 1);
      if (duplicate) {
        selectHotel(duplicate.id);
        setStatus(
          `“${duplicate.name}” is already on your shortlist — review prices and click Update.`,
        );
      } else {
        const priceBits: string[] = [];
        if (parsed.priceOneRoom != null) {
          priceBits.push(
            `1 room ${formatPriceWithOperator(
              String(parsed.priceOneRoom),
              parsed.operatorOneRoom ?? "",
            )}`,
          );
        }
        if (parsed.priceTwoRooms != null) {
          priceBits.push(
            `2 rooms ${formatPriceWithOperator(
              String(parsed.priceTwoRooms),
              parsed.operatorTwoRooms ?? "",
            )}`,
          );
        }
        if (parsed.priceThreeRooms != null) {
          priceBits.push(
            `3 rooms ${formatPriceWithOperator(
              String(parsed.priceThreeRooms),
              parsed.operatorThreeRooms ?? "",
            )}`,
          );
        }
        const priceMsg =
          priceBits.length > 0
            ? ` Prices: ${priceBits.join(", ")}.`
            : " No matching tour prices found — enter them manually.";
        setStatus(
          parsed.photoUrl
            ? `Loaded “${parsed.name}” with map coordinates and photo.${priceMsg}`
            : `Loaded “${parsed.name}” with map coordinates.${priceMsg}`,
        );
      }
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

    const hotelId = form.hotelId ? Number(form.hotelId) : null;
    // Creating: if this hotel is already shortlisted, update that entry instead.
    const duplicate =
      form.id == null
        ? findDuplicateHotel(notes, {
            hotelId,
            pageUrl: form.pageUrl,
            name: form.name,
            latitude: lat,
            longitude: lng,
          })
        : undefined;
    const id = form.id ?? duplicate?.id ?? newNoteId();
    const existing = notes.find((n) => n.id === id);
    const now = new Date().toISOString();
    const photoUrl =
      form.photoUrl.trim() ||
      existing?.photoUrl ||
      photoUrlFromHotelId(hotelId, form.pageUrl.trim()) ||
      "";
    const note: HotelNote = {
      id,
      hotelId,
      name: form.name.trim(),
      pageUrl: form.pageUrl.trim(),
      photoUrl,
      latitude: lat,
      longitude: lng,
      priceOneRoom: form.priceOneRoom.trim(),
      priceTwoRooms: form.priceTwoRooms.trim(),
      priceThreeRooms: form.priceThreeRooms.trim(),
      operatorOneRoom: form.operatorOneRoom.trim(),
      operatorTwoRooms: form.operatorTwoRooms.trim(),
      operatorThreeRooms: form.operatorThreeRooms.trim(),
      tourRequestUrl:
        form.tourRequestUrl.trim() || existing?.tourRequestUrl || "",
      tourRefererUrl:
        form.tourRefererUrl.trim() || existing?.tourRefererUrl || "",
      priceHistoryOneRoom:
        form.priceHistoryOneRoom.length > 0
          ? form.priceHistoryOneRoom
          : (existing?.priceHistoryOneRoom ?? []),
      priceHistoryTwoRooms:
        form.priceHistoryTwoRooms.length > 0
          ? form.priceHistoryTwoRooms
          : (existing?.priceHistoryTwoRooms ?? []),
      priceHistoryThreeRooms:
        form.priceHistoryThreeRooms.length > 0
          ? form.priceHistoryThreeRooms
          : (existing?.priceHistoryThreeRooms ?? []),
      stars: form.stars ?? existing?.stars ?? null,
      rating: form.rating ?? existing?.rating ?? null,
      reviewCount: form.reviewCount ?? existing?.reviewCount ?? null,
      notes: form.notes.trim(),
      favorite: form.favorite,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    const next = upsertNote(notes, note);
    persist(next);
    selectHotel(id);
    setForm(emptyForm());
    setEditBaseline(null);
    setCancelEditConfirm(false);
    setOperatorLockKey((k) => k + 1);
    setStatus(
      existing || duplicate
        ? `Updated “${note.name}”.`
        : `Saved “${note.name}”.`,
    );
  }

  function handleEdit(note: HotelNote) {
    const photoUrl =
      note.photoUrl || photoUrlFromHotelId(note.hotelId, note.pageUrl);
    const next: FormState = {
      id: note.id,
      curl: "",
      name: note.name,
      pageUrl: note.pageUrl,
      photoUrl,
      hotelId: note.hotelId != null ? String(note.hotelId) : "",
      latitude: String(note.latitude),
      longitude: String(note.longitude),
      priceOneRoom: note.priceOneRoom,
      priceTwoRooms: note.priceTwoRooms,
      priceThreeRooms: note.priceThreeRooms,
      operatorOneRoom: note.operatorOneRoom,
      operatorTwoRooms: note.operatorTwoRooms,
      operatorThreeRooms: note.operatorThreeRooms,
      tourRequestUrl: note.tourRequestUrl,
      tourRefererUrl: note.tourRefererUrl,
      priceHistoryOneRoom: note.priceHistoryOneRoom,
      stars: note.stars,
      rating: note.rating,
      reviewCount: note.reviewCount,
      priceHistoryTwoRooms: note.priceHistoryTwoRooms,
      priceHistoryThreeRooms: note.priceHistoryThreeRooms,
      notes: note.notes,
      favorite: note.favorite,
    };
    setForm(next);
    setEditBaseline(snapshotEditBaseline(next));
    setCancelEditConfirm(false);
    setOperatorLockKey((k) => k + 1);
    selectHotel(note.id);
    setStatus(`Editing “${note.name}”.`);
  }

  function clearEditForm(statusMessage = "Form cleared.") {
    setForm(emptyForm());
    setEditBaseline(null);
    setCancelEditConfirm(false);
    setOperatorLockKey((k) => k + 1);
    setStatus(statusMessage);
  }

  function handleCancelEdit() {
    if (isEditDirty(form, editBaseline)) {
      setCancelEditConfirm(true);
      return;
    }
    clearEditForm();
  }

  function handleDelete(id: string) {
    const note = notes.find((n) => n.id === id);
    if (!note) return;
    setDeleteConfirm({ id: note.id, name: note.name });
  }

  function confirmDelete() {
    if (!deleteConfirm) return;
    const { id, name } = deleteConfirm;
    setDeleteConfirm(null);
    persist(removeNote(notes, id));
    if (form.id === id) {
      clearEditForm(`Removed “${name}”.`);
      return;
    }
    setStatus(`Removed “${name}”.`);
  }

  function handleToggleFavorite(id: string) {
    const note = notes.find((n) => n.id === id);
    if (!note) return;
    const next = upsertNote(notes, {
      ...note,
      favorite: !note.favorite,
      updatedAt: new Date().toISOString(),
    });
    persist(next);
    if (form.id === id) {
      setForm((f) => ({ ...f, favorite: !note.favorite }));
    }
    setStatus(
      !note.favorite
        ? `Marked “${note.name}” as favorite.`
        : `Removed “${note.name}” from favorites.`,
    );
  }

  async function handleRefreshPrices(id: string) {
    const note = notes.find((n) => n.id === id);
    if (!note) return;
    if (!note.tourRequestUrl.trim()) {
      setStatus(
        `“${note.name}” has no saved tour search — load a curl and save once before refreshing.`,
      );
      return;
    }

    setRefreshingId(id);
    setStatus(`Refreshing prices for “${note.name}”…`);
    try {
      const refreshed = await refreshHotelPrices(
        note.tourRequestUrl,
        note.tourRefererUrl,
      );
      const now = new Date().toISOString();
      const flash: PriceFlash = {};

      let priceOneRoom = note.priceOneRoom;
      let operatorOneRoom = note.operatorOneRoom;
      let priceHistoryOneRoom = note.priceHistoryOneRoom;
      if (refreshed.priceOneRoom != null) {
        const next = String(refreshed.priceOneRoom);
        if (note.priceOneRoom && note.priceOneRoom !== next) {
          priceHistoryOneRoom = prependPriceHistory(note.priceHistoryOneRoom, {
            price: note.priceOneRoom,
            operator: note.operatorOneRoom,
            capturedAt: now,
          });
          flash.one = { from: note.priceOneRoom, to: next };
        }
        priceOneRoom = next;
        operatorOneRoom = refreshed.operatorOneRoom ?? "";
      }

      let priceTwoRooms = note.priceTwoRooms;
      let operatorTwoRooms = note.operatorTwoRooms;
      let priceHistoryTwoRooms = note.priceHistoryTwoRooms;
      if (refreshed.priceTwoRooms != null) {
        const next = String(refreshed.priceTwoRooms);
        if (note.priceTwoRooms && note.priceTwoRooms !== next) {
          priceHistoryTwoRooms = prependPriceHistory(
            note.priceHistoryTwoRooms,
            {
              price: note.priceTwoRooms,
              operator: note.operatorTwoRooms,
              capturedAt: now,
            },
          );
          flash.two = { from: note.priceTwoRooms, to: next };
        }
        priceTwoRooms = next;
        operatorTwoRooms = refreshed.operatorTwoRooms ?? "";
      }

      let priceThreeRooms = note.priceThreeRooms;
      let operatorThreeRooms = note.operatorThreeRooms;
      let priceHistoryThreeRooms = note.priceHistoryThreeRooms;
      if (refreshed.priceThreeRooms != null) {
        const next = String(refreshed.priceThreeRooms);
        if (note.priceThreeRooms && note.priceThreeRooms !== next) {
          priceHistoryThreeRooms = prependPriceHistory(
            note.priceHistoryThreeRooms,
            {
              price: note.priceThreeRooms,
              operator: note.operatorThreeRooms,
              capturedAt: now,
            },
          );
          flash.three = { from: note.priceThreeRooms, to: next };
        }
        priceThreeRooms = next;
        operatorThreeRooms = refreshed.operatorThreeRooms ?? "";
      }

      const anyPrice =
        refreshed.priceOneRoom != null ||
        refreshed.priceTwoRooms != null ||
        refreshed.priceThreeRooms != null;
      const stars = refreshed.stars ?? note.stars;
      const rating = refreshed.rating ?? note.rating;
      const reviewCount = refreshed.reviewCount ?? note.reviewCount;
      const anyQuality =
        refreshed.stars != null ||
        refreshed.rating != null ||
        refreshed.reviewCount != null;

      if (!anyPrice && !anyQuality) {
        setStatus(
          `No matching tour prices found for “${note.name}” — existing prices kept.`,
        );
        return;
      }

      const updated: HotelNote = {
        ...note,
        priceOneRoom,
        priceTwoRooms,
        priceThreeRooms,
        operatorOneRoom,
        operatorTwoRooms,
        operatorThreeRooms,
        priceHistoryOneRoom,
        priceHistoryTwoRooms,
        priceHistoryThreeRooms,
        stars,
        rating,
        reviewCount,
        updatedAt: now,
      };
      persist(upsertNote(notes, updated));
      if (anyPrice) {
        setPriceFlashById((m) => ({ ...m, [id]: flash }));
      }
      if (form.id === id) {
        setForm((f) => ({
          ...f,
          priceOneRoom,
          priceTwoRooms,
          priceThreeRooms,
          operatorOneRoom,
          operatorTwoRooms,
          operatorThreeRooms,
          priceHistoryOneRoom,
          priceHistoryTwoRooms,
          priceHistoryThreeRooms,
          stars,
          rating,
          reviewCount,
        }));
        setOperatorLockKey((k) => k + 1);
      }

      setStatus(
        anyPrice
          ? `Updated prices for “${note.name}”.`
          : `Updated hotel rating for “${note.name}” — no matching tour prices.`,
      );
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setRefreshingId(null);
    }
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
      setEditBaseline(null);
      setCancelEditConfirm(false);
      setOperatorLockKey((k) => k + 1);
      setFocusId(null);
      setStatus(`Imported ${imported.length} hotel(s) from backup.`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    } finally {
      if (importInputRef.current) importInputRef.current.value = "";
    }
  }

  return (
    <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:h-[100dvh] lg:grid-cols-2 lg:overflow-hidden lg:py-4">
      <div className="space-y-6 lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain lg:pr-1">
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
            {busy ? "Loading…" : "Load name, coordinates & prices"}
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

            {(() => {
              const quality = formatHotelQuality(form);
              return quality ? (
                <p className="sm:col-span-2 text-sm text-slate-600">{quality}</p>
              ) : null;
            })()}

            <label className="block text-sm font-medium text-slate-700 sm:col-span-2">
              Hotel page URL
              <input
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                value={form.pageUrl}
                onChange={(e) => setField("pageUrl", e.target.value)}
              />
            </label>

            {form.photoUrl ? (
              <div className="sm:col-span-2">
                <div className="text-sm font-medium text-slate-700">Photo</div>
                <img
                  src={form.photoUrl}
                  alt=""
                  className="mt-1 h-24 w-36 rounded-xl object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>
            ) : null}

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
              <OperatorField
                value={form.operatorOneRoom}
                onChange={(v) => setField("operatorOneRoom", v)}
                lockKey={`one-${operatorLockKey}`}
                aria-label="Operator for 1-room price"
              />
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
              <OperatorField
                value={form.operatorTwoRooms}
                onChange={(v) => setField("operatorTwoRooms", v)}
                lockKey={`two-${operatorLockKey}`}
                aria-label="Operator for 2-room price"
              />
            </label>

            <label className="block text-sm font-medium text-slate-700">
              Price — 3 rooms
              <div className="relative mt-1">
                <input
                  inputMode="numeric"
                  className="w-full rounded-xl border border-slate-300 py-2 pl-3 pr-8"
                  value={formatPriceInput(form.priceThreeRooms)}
                  onChange={(e) =>
                    setField(
                      "priceThreeRooms",
                      parsePriceDigits(e.target.value),
                    )
                  }
                  placeholder="500 000"
                />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-slate-400">
                  ₽
                </span>
              </div>
              <OperatorField
                value={form.operatorThreeRooms}
                onChange={(v) => setField("operatorThreeRooms", v)}
                lockKey={`three-${operatorLockKey}`}
                aria-label="Operator for 3-room price"
              />
            </label>

            {(form.priceHistoryOneRoom.length > 0 ||
              form.priceHistoryTwoRooms.length > 0 ||
              form.priceHistoryThreeRooms.length > 0) && (
              <div className="sm:col-span-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                <p className="font-medium text-slate-700">Price history</p>
                {form.priceHistoryOneRoom.length > 0 ? (
                  <p className="mt-1">
                    1 room:{" "}
                    {[...form.priceHistoryOneRoom]
                      .reverse()
                      .map((h) => formatPriceWithOperator(h.price, h.operator))
                      .join(" → ")}
                  </p>
                ) : null}
                {form.priceHistoryTwoRooms.length > 0 ? (
                  <p className="mt-1">
                    2 rooms:{" "}
                    {[...form.priceHistoryTwoRooms]
                      .reverse()
                      .map((h) => formatPriceWithOperator(h.price, h.operator))
                      .join(" → ")}
                  </p>
                ) : null}
                {form.priceHistoryThreeRooms.length > 0 ? (
                  <p className="mt-1">
                    3 rooms:{" "}
                    {[...form.priceHistoryThreeRooms]
                      .reverse()
                      .map((h) => formatPriceWithOperator(h.price, h.operator))
                      .join(" → ")}
                  </p>
                ) : null}
              </div>
            )}

            <label className="block text-sm font-medium text-slate-700 sm:col-span-2">
              Your notes
              <textarea
                className="mt-1 h-28 w-full rounded-xl border border-slate-300 px-3 py-2"
                value={form.notes}
                onChange={(e) => setField("notes", e.target.value)}
                placeholder="Room name, dates, what you liked…"
              />
            </label>

            <button
              type="button"
              onClick={() => setField("favorite", !form.favorite)}
              className={`inline-flex w-fit items-center justify-center rounded-xl border p-2 sm:col-span-2 ${
                form.favorite
                  ? "border-amber-300 bg-amber-50 text-amber-400"
                  : "border-slate-300 bg-white text-slate-300 hover:text-amber-400"
              }`}
              aria-pressed={form.favorite}
              aria-label={form.favorite ? "Remove from favorites" : "Add to favorites"}
              title={form.favorite ? "Remove from favorites" : "Add to favorites"}
            >
              <StarIcon filled={form.favorite} className="h-6 w-6" />
            </button>
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
                onClick={handleCancelEdit}
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
              Saved hotels ({sorted.length}
              {favoritesOnly ? ` of ${notes.length}` : ""})
            </h2>
            <div className="flex flex-wrap gap-2">
              <label className="inline-flex items-center gap-1.5 text-sm text-slate-700">
                <span className="sr-only">Sort by</span>
                <select
                  value={sortMode}
                  onChange={(e) => setSortMode(e.target.value as SortMode)}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-50"
                >
                  <option value="recent">Sort: recent</option>
                  <option value="name">Sort: name</option>
                  <option value="rating">Sort: rating</option>
                  <option value="one-asc">1 room: low → high</option>
                  <option value="one-desc">1 room: high → low</option>
                  <option value="two-asc">2 rooms: low → high</option>
                  <option value="two-desc">2 rooms: high → low</option>
                  <option value="three-asc">3 rooms: low → high</option>
                  <option value="three-desc">3 rooms: high → low</option>
                </select>
              </label>
              <button
                type="button"
                onClick={() => setFavoritesOnly((v) => !v)}
                className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm font-medium ${
                  favoritesOnly
                    ? "border-amber-300 bg-amber-50 text-amber-700"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                }`}
                aria-pressed={favoritesOnly}
              >
                <StarIcon
                  filled={favoritesOnly}
                  className={`h-4 w-4 ${
                    favoritesOnly ? "text-amber-500" : "text-slate-400"
                  }`}
                />
                Favorites only
                {favoriteCount > 0 ? ` (${favoriteCount})` : ""}
              </button>
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
          {notes.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">
              None yet. Export downloads a backup JSON; Import restores it.
            </p>
          ) : sorted.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">
              No favorites yet. Tap the star on a hotel to mark one.
            </p>
          ) : (
            <ul className="mt-3 space-y-3">
              {sorted.map((n) => (
                <li
                  key={n.id}
                  className={`cursor-pointer rounded-xl border p-3 transition-colors ${
                    focusId === n.id
                      ? "border-teal-500 bg-teal-50 ring-1 ring-teal-400"
                      : n.favorite
                        ? "border-amber-300 bg-amber-50/60"
                        : "border-slate-200 bg-slate-50 hover:border-slate-300"
                  }`}
                  onClick={() => toggleFocusHotel(n.id)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      {n.photoUrl ? (
                        <img
                          src={n.photoUrl}
                          alt=""
                          className="h-16 w-20 shrink-0 rounded-lg object-cover"
                          loading="lazy"
                          referrerPolicy="no-referrer"
                        />
                      ) : null}
                      <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          className={`shrink-0 rounded p-0.5 ${
                            n.favorite
                              ? "text-amber-400 hover:text-amber-500"
                              : "text-slate-300 hover:text-amber-400"
                          }`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleFavorite(n.id);
                          }}
                          aria-label={
                            n.favorite
                              ? `Remove ${n.name} from favorites`
                              : `Add ${n.name} to favorites`
                          }
                          aria-pressed={n.favorite}
                        >
                          <StarIcon filled={n.favorite} className="h-5 w-5" />
                        </button>
                        <span className="font-semibold text-teal-800">
                          {n.name}
                        </span>
                      </div>
                      {(() => {
                        const quality = formatHotelQuality(n);
                        return quality ? (
                          <p className="mt-0.5 text-sm text-slate-500">
                            {quality}
                          </p>
                        ) : null;
                      })()}
                      <div className="mt-1 text-sm text-slate-600">
                        {[
                          formatPriceSlot(
                            "1 room",
                            n.priceOneRoom,
                            n.operatorOneRoom,
                            priceFlashById[n.id]?.one,
                          ),
                          formatPriceSlot(
                            "2 rooms",
                            n.priceTwoRooms,
                            n.operatorTwoRooms,
                            priceFlashById[n.id]?.two,
                          ),
                          formatPriceSlot(
                            "3 rooms",
                            n.priceThreeRooms,
                            n.operatorThreeRooms,
                            priceFlashById[n.id]?.three,
                          ),
                        ]
                          .filter(Boolean)
                          .reduce<ReactNode[]>((acc, node, i) => {
                            if (!node) return acc;
                            if (acc.length) {
                              acc.push(
                                <span key={`sep-${i}`}> · </span>,
                              );
                            }
                            acc.push(node);
                            return acc;
                          }, [])}
                      </div>
                      {(() => {
                        const was = formatHistoryWasLine(n);
                        return was ? (
                          <p className="mt-0.5 text-xs text-slate-500">{was}</p>
                        ) : null;
                      })()}
                      {n.notes ? (
                        <p className="mt-1 text-sm text-slate-700">{n.notes}</p>
                      ) : null}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-center gap-0.5">
                      <button
                        type="button"
                        className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                        disabled={
                          !n.tourRequestUrl.trim() || refreshingId === n.id
                        }
                        title={
                          n.tourRequestUrl.trim()
                            ? "Refresh tour prices"
                            : "Load a curl and save once before refreshing"
                        }
                        aria-label={
                          refreshingId === n.id
                            ? `Refreshing prices for ${n.name}`
                            : `Refresh prices for ${n.name}`
                        }
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleRefreshPrices(n.id);
                        }}
                      >
                        <RefreshIcon
                          className={`h-4 w-4 ${
                            refreshingId === n.id ? "animate-spin" : ""
                          }`}
                        />
                      </button>
                      <button
                        type="button"
                        className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                        title="Edit"
                        aria-label={`Edit ${n.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEdit(n);
                        }}
                      >
                        <PencilIcon className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        className="rounded p-1 text-rose-500 hover:bg-rose-50 hover:text-rose-700"
                        title="Delete"
                        aria-label={`Delete ${n.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(n.id);
                        }}
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                      {n.pageUrl ? (
                        <a
                          className="rounded p-1 text-teal-600 hover:bg-teal-50 hover:text-teal-800"
                          href={n.pageUrl}
                          target="_blank"
                          rel="noreferrer"
                          title="Open hotel page"
                          aria-label={`Open ${n.name} on sletat`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ExternalLinkIcon className="h-4 w-4" />
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

      <section className="h-[min(70vh,560px)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:h-full lg:min-h-0">
        <HotelsMap
          notes={mapNotes}
          focusId={focusId}
          focusNonce={focusNonce}
        />
      </section>

      <ConfirmDialog
        open={deleteConfirm != null}
        title="Delete hotel?"
        message={
          deleteConfirm
            ? `Remove “${deleteConfirm.name}” from your shortlist? This cannot be undone.`
            : ""
        }
        confirmLabel="Delete"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setDeleteConfirm(null)}
      />

      <ConfirmDialog
        open={cancelEditConfirm}
        title="Discard changes?"
        message="You have unsaved edits. Discard them and leave edit mode?"
        confirmLabel="Discard"
        danger
        onConfirm={() => clearEditForm()}
        onCancel={() => setCancelEditConfirm(false)}
      />
    </div>
  );
}
