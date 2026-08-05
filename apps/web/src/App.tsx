import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import ConfirmDialog from "./ConfirmDialog";
import HotelsMap from "./HotelsMap";
import OperatorField from "./OperatorField";
import PencilIcon from "./PencilIcon";
import RefreshIcon from "./RefreshIcon";
import ExternalLinkIcon from "./ExternalLinkIcon";
import StarIcon from "./StarIcon";
import TrashIcon from "./TrashIcon";
import ThumbsDownIcon from "./ThumbsDownIcon";
import { parseTourCurl, refreshHotelPrices, type RefreshedPrices } from "./api";
import { downloadBackup, parseBackupJson, readBackupFile } from "./backup";
import { formatPrice, formatPriceInput, parsePriceDigits } from "./formatPrice";
import { fillMissingPhotos, photoUrlFromHotelId } from "./photoUrl";
import {
  defaultSortDir,
  sortDirFromMode,
  sortFieldFromMode,
  sortHotels,
  toSortMode,
  type SortField,
  type SortMode,
} from "./sortHotels";
import { BestSortIcon, RecentSortIcon } from "./SortIcons";
import {
  findDuplicateHotel,
  loadBestPricePercent,
  loadNotes,
  newNoteId,
  removeNote,
  saveBestPricePercent,
  saveNotes,
  upsertNote,
} from "./storage";
import type { HotelNote, PriceHistoryEntry } from "./types";
import {
  formatHotelQuality,
  historyAfterPriceChange,
  prependPriceHistory,
} from "./types";
import {
  applyViewerPrefs,
  loadViewerPrefs,
  saveViewerPrefs,
  setViewerDisliked,
  setViewerFavorite,
} from "./viewerPrefs";
import {
  ratingPriorFromHotels,
  weightedRating,
} from "./weightedRating";

/** Read-only catalog viewer (local `dev:viewer` or GitHub Pages). */
const isPublicViewer = import.meta.env.VITE_PUBLIC_VIEWER === "true";

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
  disliked: boolean;
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
  disliked: false,
});

/** Pause between finishing one hotel refresh and starting the next (bulk). */
const REFRESH_ALL_GAP_MS = 1250;

/** Transient list hints after refresh (strikethrough old → new / unavailable). */
type PriceFlashEntry =
  | { from: string; to: string }
  | { from: string; unavailable: true };

type PriceFlash = {
  one?: PriceFlashEntry;
  two?: PriceFlashEntry;
  three?: PriceFlashEntry;
};

type ApplyRefreshResult = {
  /** Null when refresh found nothing useful and left the note unchanged. */
  updated: HotelNote | null;
  flash: PriceFlash;
  unavailableLabels: string[];
  anyPrice: boolean;
};

function applyRefreshedPricesToNote(
  note: HotelNote,
  refreshed: RefreshedPrices,
  now: string,
): ApplyRefreshResult {
  const flash: PriceFlash = {};
  const unavailableLabels: string[] = [];

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

  /**
   * A successful refresh always includes a room catalog (API errors otherwise).
   * Null slots mean that room count has no live offer — clear stale prices
   * instead of keeping or resurrecting history (e.g. Anex from days ago).
   */
  function applyRoomSlot(
    label: string,
    flashKey: keyof PriceFlash,
    prevPrice: string,
    prevOperator: string,
    prevHistory: PriceHistoryEntry[],
    nextPrice: number | null,
    nextOperator: string | null,
  ): {
    price: string;
    operator: string;
    history: PriceHistoryEntry[];
  } {
    if (nextPrice != null) {
      const next = String(nextPrice);
      let history = prevHistory;
      if (prevPrice && prevPrice !== next) {
        history = historyAfterPriceChange(
          prevHistory,
          prevPrice,
          prevOperator,
          next,
          now,
        );
        flash[flashKey] = { from: prevPrice, to: next };
      }
      return {
        price: next,
        operator: nextOperator ?? "",
        history,
      };
    }

    if (prevPrice.trim()) {
      unavailableLabels.push(label);
      flash[flashKey] = { from: prevPrice, unavailable: true };
      const history =
        prevHistory[0]?.price === prevPrice.trim()
          ? prevHistory
          : prependPriceHistory(prevHistory, {
              price: prevPrice.trim(),
              operator: prevOperator,
              capturedAt: now,
            });
      return { price: "", operator: "", history };
    }

    return {
      price: "",
      operator: "",
      history: prevHistory,
    };
  }

  const one = applyRoomSlot(
    "1 room",
    "one",
    note.priceOneRoom,
    note.operatorOneRoom,
    note.priceHistoryOneRoom,
    refreshed.priceOneRoom,
    refreshed.operatorOneRoom,
  );
  const two = applyRoomSlot(
    "2 rooms",
    "two",
    note.priceTwoRooms,
    note.operatorTwoRooms,
    note.priceHistoryTwoRooms,
    refreshed.priceTwoRooms,
    refreshed.operatorTwoRooms,
  );
  const three = applyRoomSlot(
    "3 rooms",
    "three",
    note.priceThreeRooms,
    note.operatorThreeRooms,
    note.priceHistoryThreeRooms,
    refreshed.priceThreeRooms,
    refreshed.operatorThreeRooms,
  );

  const pricesUnchanged =
    one.price === note.priceOneRoom &&
    one.operator === note.operatorOneRoom &&
    two.price === note.priceTwoRooms &&
    two.operator === note.operatorTwoRooms &&
    three.price === note.priceThreeRooms &&
    three.operator === note.operatorThreeRooms &&
    stars === note.stars &&
    rating === note.rating &&
    reviewCount === note.reviewCount;

  if (!anyPrice && !anyQuality && unavailableLabels.length === 0) {
    return {
      updated: null,
      flash,
      unavailableLabels,
      anyPrice,
    };
  }

  if (pricesUnchanged && unavailableLabels.length === 0) {
    return {
      updated: null,
      flash,
      unavailableLabels,
      anyPrice,
    };
  }

  return {
    updated: {
      ...note,
      priceOneRoom: one.price,
      priceTwoRooms: two.price,
      priceThreeRooms: three.price,
      operatorOneRoom: one.operator,
      operatorTwoRooms: two.operator,
      operatorThreeRooms: three.operator,
      priceHistoryOneRoom: one.history,
      priceHistoryTwoRooms: two.history,
      priceHistoryThreeRooms: three.history,
      stars,
      rating,
      reviewCount,
      updatedAt: now,
    },
    flash,
    unavailableLabels,
    anyPrice,
  };
}

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
  disliked: boolean;
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
    disliked: f.disliked,
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
    form.favorite !== baseline.favorite ||
    form.disliked !== baseline.disliked
  );
}

function formatPriceWithOperator(price: string, operator: string): string {
  const formatted = formatPrice(price);
  const op = operator.trim();
  return op ? `${formatted} (${op})` : formatted;
}

/** Match baseline hotel by id, then hotelId, then name+coords. */
function findBaselineHotel(
  note: HotelNote,
  baseline: HotelNote[],
): HotelNote | undefined {
  const byId = baseline.find((b) => b.id === note.id);
  if (byId) return byId;
  if (note.hotelId != null) {
    const byHotelId = baseline.find((b) => b.hotelId === note.hotelId);
    if (byHotelId) return byHotelId;
  }
  return baseline.find(
    (b) =>
      b.name === note.name &&
      b.latitude === note.latitude &&
      b.longitude === note.longitude,
  );
}

function slotFlash(
  oldPrice: string,
  oldOperator: string,
  newPrice: string,
): PriceFlashEntry | undefined {
  const from = oldPrice.trim();
  const to = newPrice.trim();
  if (from && to && from !== to) return { from, to };
  if (from && !to) return { from, unavailable: true };
  void oldOperator;
  return undefined;
}

/**
 * Build strikethrough flashes: baseline (old) → current (new).
 * Also folds old prices into history when missing.
 */
function applyBaselinePriceFlash(
  notes: HotelNote[],
  baseline: HotelNote[],
  capturedAt: string,
): { notes: HotelNote[]; flashById: Record<string, PriceFlash>; changed: number } {
  const flashById: Record<string, PriceFlash> = {};
  let changed = 0;
  const nextNotes = notes.map((note) => {
    const old = findBaselineHotel(note, baseline);
    if (!old) return note;

    const one = slotFlash(
      old.priceOneRoom,
      old.operatorOneRoom,
      note.priceOneRoom,
    );
    const two = slotFlash(
      old.priceTwoRooms,
      old.operatorTwoRooms,
      note.priceTwoRooms,
    );
    const three = slotFlash(
      old.priceThreeRooms,
      old.operatorThreeRooms,
      note.priceThreeRooms,
    );
    if (!one && !two && !three) return note;

    changed += 1;
    flashById[note.id] = {
      ...(one ? { one } : {}),
      ...(two ? { two } : {}),
      ...(three ? { three } : {}),
    };

    let priceHistoryOneRoom = note.priceHistoryOneRoom;
    let priceHistoryTwoRooms = note.priceHistoryTwoRooms;
    let priceHistoryThreeRooms = note.priceHistoryThreeRooms;
    if (one && "to" in one) {
      priceHistoryOneRoom = historyAfterPriceChange(
        priceHistoryOneRoom,
        one.from,
        old.operatorOneRoom,
        one.to,
        capturedAt,
      );
    } else if (one && "unavailable" in one) {
      priceHistoryOneRoom =
        priceHistoryOneRoom[0]?.price === one.from
          ? priceHistoryOneRoom
          : prependPriceHistory(priceHistoryOneRoom, {
              price: one.from,
              operator: old.operatorOneRoom,
              capturedAt,
            });
    }
    if (two && "to" in two) {
      priceHistoryTwoRooms = historyAfterPriceChange(
        priceHistoryTwoRooms,
        two.from,
        old.operatorTwoRooms,
        two.to,
        capturedAt,
      );
    } else if (two && "unavailable" in two) {
      priceHistoryTwoRooms =
        priceHistoryTwoRooms[0]?.price === two.from
          ? priceHistoryTwoRooms
          : prependPriceHistory(priceHistoryTwoRooms, {
              price: two.from,
              operator: old.operatorTwoRooms,
              capturedAt,
            });
    }
    if (three && "to" in three) {
      priceHistoryThreeRooms = historyAfterPriceChange(
        priceHistoryThreeRooms,
        three.from,
        old.operatorThreeRooms,
        three.to,
        capturedAt,
      );
    } else if (three && "unavailable" in three) {
      priceHistoryThreeRooms =
        priceHistoryThreeRooms[0]?.price === three.from
          ? priceHistoryThreeRooms
          : prependPriceHistory(priceHistoryThreeRooms, {
              price: three.from,
              operator: old.operatorThreeRooms,
              capturedAt,
            });
    }

    return {
      ...note,
      priceHistoryOneRoom,
      priceHistoryTwoRooms,
      priceHistoryThreeRooms,
    };
  });

  return { notes: nextNotes, flashById, changed };
}

type PriceStep = { node: ReactNode; digits: number | null };

function priceDigitsValue(price: string): number | null {
  const digits = parsePriceDigits(price);
  return digits ? Number(digits) : null;
}

/** green = price dropped since the prior step, light red = it rose. */
function trendColorClass(fromDigits: number | null, toDigits: number | null): string {
  if (fromDigits == null || toDigits == null || fromDigits === toDigits) {
    return "text-slate-800";
  }
  return toDigits < fromDigits ? "text-emerald-600" : "text-red-400";
}

function arrowColorClass(fromDigits: number | null, toDigits: number | null): string {
  if (fromDigits == null || toDigits == null || fromDigits === toDigits) {
    return "text-slate-400";
  }
  return toDigits < fromDigits ? "text-emerald-600" : "text-red-400";
}

/** Chains steps with " → " separators colored by that step's price trend. */
function joinSteps(steps: PriceStep[]): ReactNode[] {
  const out: ReactNode[] = [];
  steps.forEach((step, i) => {
    if (i > 0) {
      out.push(
        <span
          key={`arrow-${i}`}
          className={arrowColorClass(steps[i - 1].digits, step.digits)}
        >
          {" → "}
        </span>,
      );
    }
    out.push(step.node);
  });
  return out;
}

/**
 * Full price chain for a room slot: every recorded past price (struck
 * through, oldest first) leading up to the current price/flash, with each
 * arrow/destination price colored by that step's trend (green = cheaper,
 * light red = pricier). `history` is newest-first and already caps at
 * PRICE_HISTORY_CAP entries.
 */
function formatPriceSlot(
  label: string,
  price: string,
  operator: string,
  history: PriceHistoryEntry[],
  flash?: PriceFlashEntry,
): ReactNode {
  if (!price && !flash && history.length === 0) return null;

  // history[0] duplicates flash.from (or, with no flash, the current price
  // itself), so only the entries behind it are shown as extra past steps.
  const steps: PriceStep[] = [...history.slice(1)].reverse().map((h, i) => ({
    node: (
      <span key={`h-${i}`} className="text-slate-400 line-through">
        {formatPriceWithOperator(h.price, h.operator)}
      </span>
    ),
    digits: priceDigitsValue(h.price),
  }));

  if (flash && "unavailable" in flash) {
    steps.push({
      node: (
        <span key="from" className="text-slate-400 line-through">
          {formatPrice(flash.from)}
        </span>
      ),
      digits: priceDigitsValue(flash.from),
    });
    steps.push({
      node: (
        <span key="to" className="font-medium">
          no longer available
        </span>
      ),
      digits: null,
    });
    return (
      <span key={label} className="text-amber-800">
        {label}: {joinSteps(steps)}
      </span>
    );
  }

  if (flash && "to" in flash) {
    const fromDigits = priceDigitsValue(flash.from);
    const toDigits = priceDigitsValue(flash.to);
    steps.push({
      node: (
        <span key="from" className="text-slate-400 line-through">
          {formatPrice(flash.from)}
        </span>
      ),
      digits: fromDigits,
    });
    steps.push({
      node: (
        <span key="to" className={`font-medium ${trendColorClass(fromDigits, toDigits)}`}>
          {formatPriceWithOperator(flash.to, operator)}
        </span>
      ),
      digits: toDigits,
    });
    return (
      <span key={label}>
        {label}: {joinSteps(steps)}
      </span>
    );
  }

  if (!price) return null;

  if (steps.length === 0) {
    return (
      <span key={label}>
        {label}: {formatPriceWithOperator(price, operator)}
      </span>
    );
  }

  const prevDigits = steps[steps.length - 1].digits;
  const currentDigits = priceDigitsValue(price);
  steps.push({
    node: (
      <span
        key="current"
        className={`font-medium ${trendColorClass(prevDigits, currentDigits)}`}
      >
        {formatPriceWithOperator(price, operator)}
      </span>
    ),
    digits: currentDigits,
  });
  return (
    <span key={label}>
      {label}: {joinSteps(steps)}
    </span>
  );
}

/** Persistable old→new display from price history (works on GitHub Pages). */
function priceFlashFromHistory(note: HotelNote): PriceFlash | undefined {
  const flash: PriceFlash = {};
  const h1 = note.priceHistoryOneRoom[0];
  const h2 = note.priceHistoryTwoRooms[0];
  const h3 = note.priceHistoryThreeRooms[0];
  if (h1?.price.trim()) {
    if (note.priceOneRoom.trim() && h1.price !== note.priceOneRoom) {
      flash.one = { from: h1.price, to: note.priceOneRoom };
    } else if (!note.priceOneRoom.trim()) {
      flash.one = { from: h1.price, unavailable: true };
    }
  }
  if (h2?.price.trim()) {
    if (note.priceTwoRooms.trim() && h2.price !== note.priceTwoRooms) {
      flash.two = { from: h2.price, to: note.priceTwoRooms };
    } else if (!note.priceTwoRooms.trim()) {
      flash.two = { from: h2.price, unavailable: true };
    }
  }
  if (h3?.price.trim()) {
    if (note.priceThreeRooms.trim() && h3.price !== note.priceThreeRooms) {
      flash.three = { from: h3.price, to: note.priceThreeRooms };
    } else if (!note.priceThreeRooms.trim()) {
      flash.three = { from: h3.price, unavailable: true };
    }
  }
  return flash.one || flash.two || flash.three ? flash : undefined;
}

function bootstrapNotes(): { notes: HotelNote[]; filled: number } {
  if (isPublicViewer) return { notes: [], filled: 0 };
  const loaded = loadNotes();
  const { notes, filled } = fillMissingPhotos(loaded);
  if (filled > 0) saveNotes(notes as HotelNote[]);
  return { notes: notes as HotelNote[], filled };
}

const initialBoot = bootstrapNotes();

export default function App() {
  const [notes, setNotes] = useState<HotelNote[]>(initialBoot.notes);
  const [catalogReady, setCatalogReady] = useState(!isPublicViewer);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [status, setStatus] = useState(
    isPublicViewer
      ? "Loading shortlist…"
      : initialBoot.filled > 0
        ? `Restored photos for ${initialBoot.filled} previously saved hotel(s).`
        : "Paste a tours curl, then fill prices and notes.",
  );
  const [busy, setBusy] = useState(false);
  /** Bumps when form is reset or operators are (re)loaded from the API — locks operator fields. */
  const [operatorLockKey, setOperatorLockKey] = useState(0);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [focusNonce, setFocusNonce] = useState(0);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("recent-desc");
  const [nameQuery, setNameQuery] = useState("");
  /** Hotel star category: 4 → 4★, 5 → 5★. */
  const [starsFilter, setStarsFilter] = useState<"all" | "4" | "5">("all");
  /** Floor band of guest rating: 8 → 8.0–8.99, 9 → 9.0–9.99. */
  const [ratingBand, setRatingBand] = useState<"all" | "8" | "9">("all");
  /** Which room price the max-price filter uses. */
  const [priceFilterRoom, setPriceFilterRoom] = useState<"1" | "2" | "3">("2");
  /** Max price digits; empty = no price filter. */
  const [priceMax, setPriceMax] = useState("");
  /** Price share of “best overall” (rest is weighted rating). Persisted. */
  const [bestPricePercent, setBestPricePercent] = useState(
    loadBestPricePercent,
  );
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [bulkRefreshing, setBulkRefreshing] = useState(false);
  const [priceFlashById, setPriceFlashById] = useState<
    Record<string, PriceFlash>
  >({});
  const [deleteConfirm, setDeleteConfirm] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [cancelEditConfirm, setCancelEditConfirm] = useState(false);
  const [editBaseline, setEditBaseline] = useState<EditBaseline | null>(null);
  /** Inline note editor on a list card (hotel id). */
  const [inlineNoteId, setInlineNoteId] = useState<string | null>(null);
  const [inlineNoteDraft, setInlineNoteDraft] = useState("");
  const importInputRef = useRef<HTMLInputElement>(null);
  const notesRef = useRef(notes);
  const formIdRef = useRef(form.id);
  formIdRef.current = form.id;
  const bulkCancelRef = useRef(false);

  useEffect(() => {
    if (!isPublicViewer) return;
    document.title = "Hotel shortlist (viewer)";
    return () => {
      document.title = "Hotel shortlist";
    };
  }, []);

  useEffect(() => {
    if (!isPublicViewer) return;
    let cancelled = false;
    const url = `${import.meta.env.BASE_URL}shortlist.json`;
    (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        let hotels = parseBackupJson(text);
        let fromLocalPreview = false;
        // Local convenience: empty committed snapshot → preview full-app shortlist.
        if (hotels.length === 0) {
          const local = loadNotes();
          if (local.length > 0) {
            hotels = local;
            fromLocalPreview = true;
          }
        }
        if (cancelled) return;
        const prefs = loadViewerPrefs();
        const next = applyViewerPrefs(hotels, prefs);
        notesRef.current = next;
        setNotes(next);
        setCatalogReady(true);
        if (hotels.length === 0) {
          setStatus(
            "No hotels found in this browser for localhost:5174. Stop the full app, run npm run dev:viewer (same port), or Export → prepare:public-shortlist.",
          );
        } else if (fromLocalPreview) {
          setStatus(
            `Previewing ${hotels.length} hotel(s) from your full-app shortlist. Favorites/dislikes here stay in this browser. Before publishing: Export → prepare:public-shortlist.`,
          );
        } else {
          setStatus(
            `Showing ${hotels.length} hotel(s). Stars/thumbs follow the published list; you can still change them in this browser.`,
          );
        }
      } catch (err) {
        if (cancelled) return;
        // Still try local shortlist if the JSON file failed to load.
        const local = loadNotes();
        if (local.length > 0) {
          const prefs = loadViewerPrefs();
          const next = applyViewerPrefs(local, prefs);
          notesRef.current = next;
          setNotes(next);
          setCatalogReady(true);
          setStatus(
            `Previewing ${local.length} hotel(s) from your full-app shortlist (could not load shortlist.json).`,
          );
          return;
        }
        setCatalogReady(true);
        setStatus(
          `Could not load shortlist.json: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const ratingPrior = useMemo(() => ratingPriorFromHotels(notes), [notes]);

  const sorted = useMemo(() => {
    const q = nameQuery.trim().toLowerCase();
    const maxDigits = parsePriceDigits(priceMax);
    const maxPrice = maxDigits ? Number(maxDigits) : null;
    let list = favoritesOnly ? notes.filter((n) => n.favorite) : notes;
    if (q) {
      list = list.filter((n) => n.name.toLowerCase().includes(q));
    }
    if (starsFilter !== "all") {
      const stars = Number(starsFilter);
      list = list.filter((n) => n.stars != null && n.stars === stars);
    }
    if (ratingBand !== "all") {
      const band = Number(ratingBand);
      list = list.filter(
        (n) => n.rating != null && Math.floor(n.rating) === band,
      );
    }
    if (maxPrice != null && Number.isFinite(maxPrice)) {
      list = list.filter((n) => {
        const raw =
          priceFilterRoom === "1"
            ? n.priceOneRoom
            : priceFilterRoom === "2"
              ? n.priceTwoRooms
              : n.priceThreeRooms;
        const digits = parsePriceDigits(raw);
        if (!digits) return false;
        const price = Number(digits);
        return Number.isFinite(price) && price <= maxPrice;
      });
    }
    return sortHotels(
      list,
      sortMode,
      ratingPrior,
      priceFilterRoom,
      bestPricePercent,
    );
  }, [
    notes,
    favoritesOnly,
    sortMode,
    nameQuery,
    starsFilter,
    ratingBand,
    priceFilterRoom,
    priceMax,
    bestPricePercent,
    ratingPrior,
  ]);

  const listFiltered =
    favoritesOnly ||
    nameQuery.trim().length > 0 ||
    starsFilter !== "all" ||
    ratingBand !== "all" ||
    parsePriceDigits(priceMax).length > 0;

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

  const sortField = sortFieldFromMode(sortMode);
  const sortDir = sortDirFromMode(sortMode);

  function selectSortField(field: SortField) {
    if (field === sortField) {
      setSortMode(toSortMode(field, sortDir === "asc" ? "desc" : "asc"));
      return;
    }
    setSortMode(toSortMode(field, defaultSortDir(field)));
  }

  function updateBestPricePercent(value: number) {
    const n = Math.min(100, Math.max(0, Math.round(value)));
    setBestPricePercent(n);
    saveBestPricePercent(n);
  }

  const sortChipClass = (active: boolean) =>
    `inline-flex min-w-[2.25rem] items-center justify-center gap-1 rounded-xl border px-2.5 py-1.5 text-sm font-medium ${
      active
        ? "border-teal-500 bg-teal-50 text-teal-800"
        : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
    }`;

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
    notesRef.current = next;
    setNotes(next);
    saveNotes(next);
  }

  /** One-shot: show ~~old~~ → new vs 2 Aug backup (local file in /public). */
  useEffect(() => {
    if (isPublicViewer) return;
    const flagKey = "hotel-shortlist.baselineFlash.2026-08-02";
    try {
      if (sessionStorage.getItem(flagKey) === "1") return;
    } catch {
      /* ignore */
    }
    let cancelled = false;
    const url = `${import.meta.env.BASE_URL}price-baseline-2026-08-02.json`;
    (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) return;
        const baseline = parseBackupJson(await res.text());
        if (cancelled || baseline.length === 0) return;
        const { notes: merged, flashById, changed } = applyBaselinePriceFlash(
          notesRef.current,
          baseline,
          "2026-08-02T15:40:23.331Z",
        );
        if (cancelled || changed === 0) {
          return;
        }
        notesRef.current = merged;
        setNotes(merged);
        saveNotes(merged);
        setPriceFlashById(flashById);
        setStatus(
          `Showing ${changed} hotel(s) with price changes vs 2 Aug backup (strikethrough = old).`,
        );
        try {
          sessionStorage.setItem(flagKey, "1");
        } catch {
          /* ignore */
        }
      } catch {
        /* baseline file optional */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
      const now = new Date().toISOString();
      let priceHistoryOneRoom =
        duplicate?.priceHistoryOneRoom ?? f.priceHistoryOneRoom;
      let priceHistoryTwoRooms =
        duplicate?.priceHistoryTwoRooms ?? f.priceHistoryTwoRooms;
      let priceHistoryThreeRooms =
        duplicate?.priceHistoryThreeRooms ?? f.priceHistoryThreeRooms;

      const nextOne =
        parsed.priceOneRoom != null
          ? String(parsed.priceOneRoom)
          : (duplicate?.priceOneRoom ?? f.priceOneRoom);
      const nextTwo =
        parsed.priceTwoRooms != null
          ? String(parsed.priceTwoRooms)
          : (duplicate?.priceTwoRooms ?? f.priceTwoRooms);
      const nextThree =
        parsed.priceThreeRooms != null
          ? String(parsed.priceThreeRooms)
          : (duplicate?.priceThreeRooms ?? f.priceThreeRooms);

      if (duplicate) {
        if (parsed.priceOneRoom != null) {
          priceHistoryOneRoom = historyAfterPriceChange(
            priceHistoryOneRoom,
            duplicate.priceOneRoom,
            duplicate.operatorOneRoom,
            nextOne,
            now,
          );
        }
        if (parsed.priceTwoRooms != null) {
          priceHistoryTwoRooms = historyAfterPriceChange(
            priceHistoryTwoRooms,
            duplicate.priceTwoRooms,
            duplicate.operatorTwoRooms,
            nextTwo,
            now,
          );
        }
        if (parsed.priceThreeRooms != null) {
          priceHistoryThreeRooms = historyAfterPriceChange(
            priceHistoryThreeRooms,
            duplicate.priceThreeRooms,
            duplicate.operatorThreeRooms,
            nextThree,
            now,
          );
        }
      }

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
        priceOneRoom: nextOne,
        priceTwoRooms: nextTwo,
        priceThreeRooms: nextThree,
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
        priceHistoryOneRoom,
        priceHistoryTwoRooms,
        priceHistoryThreeRooms,
        stars: parsed.stars ?? duplicate?.stars ?? null,
        rating: parsed.rating ?? duplicate?.rating ?? null,
        reviewCount: parsed.reviewCount ?? duplicate?.reviewCount ?? null,
        notes: duplicate?.notes ?? f.notes,
        favorite: duplicate?.favorite ?? f.favorite,
        disliked: duplicate?.disliked ?? f.disliked,
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

    let priceHistoryOneRoom =
      form.priceHistoryOneRoom.length > 0
        ? form.priceHistoryOneRoom
        : (existing?.priceHistoryOneRoom ?? []);
    let priceHistoryTwoRooms =
      form.priceHistoryTwoRooms.length > 0
        ? form.priceHistoryTwoRooms
        : (existing?.priceHistoryTwoRooms ?? []);
    let priceHistoryThreeRooms =
      form.priceHistoryThreeRooms.length > 0
        ? form.priceHistoryThreeRooms
        : (existing?.priceHistoryThreeRooms ?? []);

    if (existing) {
      priceHistoryOneRoom = historyAfterPriceChange(
        priceHistoryOneRoom,
        existing.priceOneRoom,
        existing.operatorOneRoom,
        form.priceOneRoom.trim(),
        now,
      );
      priceHistoryTwoRooms = historyAfterPriceChange(
        priceHistoryTwoRooms,
        existing.priceTwoRooms,
        existing.operatorTwoRooms,
        form.priceTwoRooms.trim(),
        now,
      );
      priceHistoryThreeRooms = historyAfterPriceChange(
        priceHistoryThreeRooms,
        existing.priceThreeRooms,
        existing.operatorThreeRooms,
        form.priceThreeRooms.trim(),
        now,
      );
    }

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
      priceHistoryOneRoom,
      priceHistoryTwoRooms,
      priceHistoryThreeRooms,
      stars: form.stars ?? existing?.stars ?? null,
      rating: form.rating ?? existing?.rating ?? null,
      reviewCount: form.reviewCount ?? existing?.reviewCount ?? null,
      notes: form.notes.trim(),
      favorite: form.favorite,
      disliked: form.disliked,
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
      disliked: note.disliked,
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

  function startInlineNote(note: HotelNote) {
    if (isPublicViewer) return;
    setInlineNoteId(note.id);
    setInlineNoteDraft(note.notes);
  }

  function cancelInlineNote() {
    setInlineNoteId(null);
    setInlineNoteDraft("");
  }

  function saveInlineNote(id: string) {
    const note = notesRef.current.find((n) => n.id === id);
    if (!note) {
      cancelInlineNote();
      return;
    }
    const nextNotes = inlineNoteDraft.trim();
    if (note.notes === nextNotes) {
      cancelInlineNote();
      return;
    }
    const updated: HotelNote = {
      ...note,
      notes: nextNotes,
      updatedAt: new Date().toISOString(),
    };
    const next = upsertNote(notesRef.current, updated);
    persist(next);
    if (formIdRef.current === id) {
      setForm((f) => ({ ...f, notes: nextNotes }));
      setEditBaseline((b) => (b ? { ...b, notes: nextNotes } : b));
    }
    cancelInlineNote();
    setStatus(
      nextNotes
        ? `Updated note for “${note.name}”.`
        : `Cleared note for “${note.name}”.`,
    );
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
    persist(removeNote(notesRef.current, id));
    if (form.id === id) {
      clearEditForm(`Removed “${name}”.`);
      return;
    }
    setStatus(`Removed “${name}”.`);
  }

  function handleToggleFavorite(id: string) {
    const note = notesRef.current.find((n) => n.id === id);
    if (!note) return;
    const nextFavorite = !note.favorite;

    if (isPublicViewer) {
      const prefs = setViewerFavorite(loadViewerPrefs(), id, nextFavorite);
      saveViewerPrefs(prefs);
      setNotes((prev) => {
        const next = applyViewerPrefs(prev, prefs);
        notesRef.current = next;
        return next;
      });
      setStatus(
        nextFavorite
          ? `Marked “${note.name}” as favorite (saved in this browser).`
          : `Removed “${note.name}” from favorites.`,
      );
      return;
    }

    const next = upsertNote(notesRef.current, {
      ...note,
      favorite: nextFavorite,
      disliked: nextFavorite ? false : note.disliked,
      updatedAt: new Date().toISOString(),
    });
    persist(next);
    if (form.id === id) {
      setForm((f) => ({
        ...f,
        favorite: nextFavorite,
        disliked: nextFavorite ? false : f.disliked,
      }));
    }
    setStatus(
      nextFavorite
        ? `Marked “${note.name}” as favorite.`
        : `Removed “${note.name}” from favorites.`,
    );
  }

  function handleToggleDisliked(id: string) {
    const note = notesRef.current.find((n) => n.id === id);
    if (!note) return;
    const nextDisliked = !note.disliked;

    if (isPublicViewer) {
      const prefs = setViewerDisliked(loadViewerPrefs(), id, nextDisliked);
      saveViewerPrefs(prefs);
      setNotes((prev) => {
        const next = applyViewerPrefs(prev, prefs);
        notesRef.current = next;
        return next;
      });
      setStatus(
        nextDisliked
          ? `Moved “${note.name}” to the bottom (saved in this browser).`
          : `Restored “${note.name}” to normal ranking.`,
      );
      return;
    }

    const next = upsertNote(notesRef.current, {
      ...note,
      disliked: nextDisliked,
      favorite: nextDisliked ? false : note.favorite,
      updatedAt: new Date().toISOString(),
    });
    persist(next);
    if (form.id === id) {
      setForm((f) => ({
        ...f,
        disliked: nextDisliked,
        favorite: nextDisliked ? false : f.favorite,
      }));
    }
    setStatus(
      nextDisliked
        ? `Moved “${note.name}” to the bottom of the list.`
        : `Restored “${note.name}” to normal ranking.`,
    );
  }

  async function refreshOneHotel(
    id: string,
  ): Promise<{
    name: string;
    kind: "updated" | "kept" | "skipped" | "error";
    unavailableLabels: string[];
    anyPrice: boolean;
    error?: string;
  }> {
    const note = notesRef.current.find((n) => n.id === id);
    if (!note) {
      return {
        name: id,
        kind: "skipped",
        unavailableLabels: [],
        anyPrice: false,
      };
    }
    if (!note.tourRequestUrl.trim()) {
      return {
        name: note.name,
        kind: "skipped",
        unavailableLabels: [],
        anyPrice: false,
      };
    }

    setRefreshingId(id);
    try {
      const refreshed = await refreshHotelPrices(
        note.tourRequestUrl,
        note.tourRefererUrl,
      );
      const result = applyRefreshedPricesToNote(
        note,
        refreshed,
        new Date().toISOString(),
      );
      if (!result.updated) {
        return {
          name: note.name,
          kind: "kept",
          unavailableLabels: [],
          anyPrice: false,
        };
      }

      const next = upsertNote(notesRef.current, result.updated);
      persist(next);

      const anyFlash = Boolean(
        result.flash.one || result.flash.two || result.flash.three,
      );
      if (anyFlash) {
        setPriceFlashById((m) => ({ ...m, [id]: result.flash }));
      }
      if (formIdRef.current === id) {
        const u = result.updated;
        setForm((f) => ({
          ...f,
          priceOneRoom: u.priceOneRoom,
          priceTwoRooms: u.priceTwoRooms,
          priceThreeRooms: u.priceThreeRooms,
          operatorOneRoom: u.operatorOneRoom,
          operatorTwoRooms: u.operatorTwoRooms,
          operatorThreeRooms: u.operatorThreeRooms,
          priceHistoryOneRoom: u.priceHistoryOneRoom,
          priceHistoryTwoRooms: u.priceHistoryTwoRooms,
          priceHistoryThreeRooms: u.priceHistoryThreeRooms,
          stars: u.stars,
          rating: u.rating,
          reviewCount: u.reviewCount,
        }));
        setOperatorLockKey((k) => k + 1);
      }

      return {
        name: note.name,
        kind: "updated",
        unavailableLabels: result.unavailableLabels,
        anyPrice: result.anyPrice,
      };
    } catch (err) {
      return {
        name: note.name,
        kind: "error",
        unavailableLabels: [],
        anyPrice: false,
        error: err instanceof Error ? err.message : String(err),
      };
    } finally {
      setRefreshingId(null);
    }
  }

  async function handleRefreshPrices(id: string) {
    if (bulkRefreshing || refreshingId) return;
    const note = notesRef.current.find((n) => n.id === id);
    if (!note) return;
    if (!note.tourRequestUrl.trim()) {
      setStatus(
        `“${note.name}” has no saved tour search — load a curl and save once before refreshing.`,
      );
      return;
    }

    setStatus(`Refreshing prices for “${note.name}”…`);
    const outcome = await refreshOneHotel(id);
    if (outcome.kind === "skipped") {
      setStatus(
        `“${outcome.name}” has no saved tour search — load a curl and save once before refreshing.`,
      );
      return;
    }
    if (outcome.kind === "error") {
      setStatus(outcome.error ?? "Refresh failed");
      return;
    }
    if (outcome.kind === "kept") {
      setStatus(
        `No matching tour prices found for “${outcome.name}” — existing prices kept.`,
      );
      return;
    }

    const unavailableMsg =
      outcome.unavailableLabels.length > 0
        ? ` Warning: ${outcome.unavailableLabels.join(", ")} no longer available.`
        : "";
    setStatus(
      outcome.anyPrice
        ? `Updated prices for “${outcome.name}”.${unavailableMsg}`
        : outcome.unavailableLabels.length > 0
          ? `Cleared unavailable room prices for “${outcome.name}”.${unavailableMsg}`
          : `Updated hotel rating for “${outcome.name}” — no matching tour prices.`,
    );
  }

  async function handleRefreshAll() {
    if (bulkRefreshing || refreshingId) return;
    const targets = notesRef.current.filter((n) => n.tourRequestUrl.trim());
    if (targets.length === 0) {
      setStatus(
        "No hotels have a saved tour search yet — load a curl and save once before refreshing.",
      );
      return;
    }

    bulkCancelRef.current = false;
    setBulkRefreshing(true);
    let updated = 0;
    let kept = 0;
    let failed = 0;
    const skipped =
      notesRef.current.length - targets.length;

    try {
      for (let i = 0; i < targets.length; i++) {
        if (bulkCancelRef.current) break;
        const hotel = targets[i]!;
        setStatus(
          `Refreshing ${i + 1}/${targets.length}: “${hotel.name}”…`,
        );
        const outcome = await refreshOneHotel(hotel.id);
        if (outcome.kind === "updated") updated += 1;
        else if (outcome.kind === "kept") kept += 1;
        else if (outcome.kind === "error") failed += 1;

        const isLast = i === targets.length - 1;
        if (!isLast && !bulkCancelRef.current) {
          await new Promise((r) => setTimeout(r, REFRESH_ALL_GAP_MS));
        }
      }

      const stopped = bulkCancelRef.current;
      const parts = [
        stopped ? "Refresh all stopped" : "Refresh all finished",
        `${updated} updated`,
      ];
      if (kept) parts.push(`${kept} unchanged`);
      if (failed) parts.push(`${failed} failed`);
      if (skipped) parts.push(`${skipped} skipped (no saved search)`);
      setStatus(`${parts[0]}: ${parts.slice(1).join(", ")}.`);
    } finally {
      setBulkRefreshing(false);
      setRefreshingId(null);
    }
  }

  function handleStopRefreshAll() {
    bulkCancelRef.current = true;
    setStatus("Stopping refresh all after the current hotel…");
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
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">
              {isPublicViewer ? "Shared shortlist" : "Personal shortlist"}
            </p>
            {isPublicViewer ? (
              <span className="rounded-md border border-teal-200 bg-teal-50 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-teal-800">
                Read-only viewer
              </span>
            ) : null}
          </div>
          <h1 className="mt-1 text-3xl font-bold text-slate-900">
            Hotel shortlist
          </h1>
          <p className="mt-2 text-slate-600">
            {isPublicViewer
              ? "Browse the published hotel list and map. Star or dislike hotels — your choices stay in this browser only."
              : "You curate hotels after checking them yourself. Paste a tours curl to fill name and coordinates, then add prices and notes."}
          </p>
          {isPublicViewer ? (
            <p className="mt-2 text-sm text-slate-500">{status}</p>
          ) : null}
        </header>

        {!isPublicViewer ? (
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
              const quality = formatHotelQuality(
                form,
                weightedRating(form.rating, form.reviewCount, ratingPrior),
              );
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

            <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
              <button
                type="button"
                onClick={() =>
                  setForm((f) => ({
                    ...f,
                    favorite: !f.favorite,
                    disliked: !f.favorite ? false : f.disliked,
                  }))
                }
                className={`inline-flex w-fit items-center justify-center rounded-xl border p-2 ${
                  form.favorite
                    ? "border-amber-300 bg-amber-50 text-amber-400"
                    : "border-slate-300 bg-white text-slate-300 hover:text-amber-400"
                }`}
                aria-pressed={form.favorite}
                aria-label={
                  form.favorite ? "Remove from favorites" : "Add to favorites"
                }
                title={
                  form.favorite ? "Remove from favorites" : "Add to favorites"
                }
              >
                <StarIcon filled={form.favorite} className="h-6 w-6" />
              </button>
              <button
                type="button"
                onClick={() =>
                  setForm((f) => ({
                    ...f,
                    disliked: !f.disliked,
                    favorite: !f.disliked ? false : f.favorite,
                  }))
                }
                className={`inline-flex w-fit items-center justify-center rounded-xl border p-2 ${
                  form.disliked
                    ? "border-slate-400 bg-slate-100 text-slate-600"
                    : "border-slate-300 bg-white text-slate-300 hover:text-slate-500"
                }`}
                aria-pressed={form.disliked}
                aria-label={
                  form.disliked
                    ? "Undo dislike — restore normal ranking"
                    : "Dislike — keep on list but sort to the bottom"
                }
                title={
                  form.disliked
                    ? "Undo dislike"
                    : "Dislike (sort to bottom, keep on list)"
                }
              >
                <ThumbsDownIcon filled={form.disliked} className="h-6 w-6" />
              </button>
            </div>
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
        ) : null}

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-slate-900">
              {isPublicViewer ? "Hotels" : "Saved hotels"} ({sorted.length}
              {listFiltered ? ` of ${notes.length}` : ""})
            </h2>
            <div className="flex flex-wrap gap-2">
              <div
                className="inline-flex items-center gap-1"
                role="group"
                aria-label="Sort by recent, name, or rating"
              >
                <button
                  type="button"
                  className={sortChipClass(sortField === "best")}
                  aria-pressed={sortField === "best"}
                  title={
                    sortField === "best"
                      ? sortDir === "desc"
                        ? `Best overall (${bestPricePercent}% ${priceFilterRoom}-room price, ${100 - bestPricePercent}% weighted) — click to reverse`
                        : `Worst overall first — click for best first`
                      : `Best overall: ${bestPricePercent}% price + ${100 - bestPricePercent}% weighted rating`
                  }
                  aria-label="Sort by best overall"
                  onClick={() => selectSortField("best")}
                >
                  <BestSortIcon className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className={sortChipClass(sortField === "recent")}
                  aria-pressed={sortField === "recent"}
                  title={
                    sortField === "recent"
                      ? sortDir === "desc"
                        ? "Recent: newest first — click for oldest first"
                        : "Recent: oldest first — click for newest first"
                      : "Sort by recent"
                  }
                  aria-label="Sort by recent"
                  onClick={() => selectSortField("recent")}
                >
                  <RecentSortIcon className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className={sortChipClass(sortField === "name")}
                  aria-pressed={sortField === "name"}
                  title={
                    sortField === "name"
                      ? sortDir === "asc"
                        ? "Name: A → Z — click for Z → A"
                        : "Name: Z → A — click for A → Z"
                      : "Sort by name"
                  }
                  aria-label="Sort by name"
                  onClick={() => selectSortField("name")}
                >
                  <span className="text-xs font-semibold tracking-tight">
                    {sortField === "name" && sortDir === "desc" ? "Z–A" : "A–Z"}
                  </span>
                </button>
                <button
                  type="button"
                  className={sortChipClass(sortField === "rating")}
                  aria-pressed={sortField === "rating"}
                  title={
                    sortField === "rating"
                      ? sortDir === "desc"
                        ? "Rating: high → low — click for low → high"
                        : "Rating: low → high — click for high → low"
                      : "Sort by guest rating"
                  }
                  aria-label="Sort by guest rating"
                  onClick={() => selectSortField("rating")}
                >
                  <StarIcon
                    filled={sortField === "rating"}
                    className="h-4 w-4"
                  />
                </button>
                <button
                  type="button"
                  className={sortChipClass(sortField === "weighted")}
                  aria-pressed={sortField === "weighted"}
                  title={
                    sortField === "weighted"
                      ? sortDir === "desc"
                        ? "Weighted rating: high → low — click for low → high"
                        : "Weighted rating: low → high — click for high → low"
                      : "Sort by vote-weighted rating"
                  }
                  aria-label="Sort by vote-weighted rating"
                  onClick={() => selectSortField("weighted")}
                >
                  <StarIcon
                    filled={sortField === "weighted"}
                    className="h-4 w-4"
                  />
                  <span className="text-[10px] font-bold leading-none">w</span>
                </button>
              </div>
              <label className="inline-flex items-center gap-1.5 text-sm text-slate-700">
                <span className="sr-only">Sort by room price</span>
                <select
                  value={
                    sortField === "one" ||
                    sortField === "two" ||
                    sortField === "three"
                      ? sortMode
                      : ""
                  }
                  onChange={(e) => {
                    const v = e.target.value;
                    if (!v) return;
                    setSortMode(v as SortMode);
                  }}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-50"
                >
                  <option value="" disabled>
                    Price sort…
                  </option>
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
              {!isPublicViewer ? (
                <>
              {bulkRefreshing ? (
                <button
                  type="button"
                  onClick={handleStopRefreshAll}
                  className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-100"
                >
                  Stop refresh
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleRefreshAll()}
                  disabled={Boolean(refreshingId) || notes.length === 0}
                  title="Refresh tour prices for every hotel with a saved search, one at a time (~1.25s apart)"
                  className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Refresh all
                </button>
              )}
              <button
                type="button"
                onClick={handleExport}
                disabled={bulkRefreshing}
                className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Export
              </button>
              <button
                type="button"
                onClick={() => importInputRef.current?.click()}
                disabled={bulkRefreshing}
                className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
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
                </>
              ) : null}
            </div>
          </div>
          {bulkRefreshing || (status && status.startsWith("Refresh all")) ? (
            <p className="mt-2 text-sm text-slate-600" aria-live="polite">
              {status}
            </p>
          ) : null}

          {notes.length > 0 ? (
            <div className="mt-3 space-y-2">
              <label className="block text-sm text-slate-700">
                <span className="sr-only">Search by hotel name</span>
                <input
                  type="search"
                  value={nameQuery}
                  onChange={(e) => setNameQuery(e.target.value)}
                  placeholder="Search by hotel name…"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <label className="inline-flex items-center gap-1.5 text-sm text-slate-700">
                  <span className="sr-only">Filter by star category</span>
                  <select
                    value={starsFilter}
                    onChange={(e) =>
                      setStarsFilter(e.target.value as "all" | "4" | "5")
                    }
                    className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-50"
                  >
                    <option value="all">Stars: any</option>
                    <option value="5">Stars: 5★</option>
                    <option value="4">Stars: 4★</option>
                  </select>
                </label>
                <label className="inline-flex items-center gap-1.5 text-sm text-slate-700">
                  <span className="sr-only">Filter by guest rating</span>
                  <select
                    value={ratingBand}
                    onChange={(e) =>
                      setRatingBand(e.target.value as "all" | "8" | "9")
                    }
                    className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-50"
                  >
                    <option value="all">Rating: any</option>
                    <option value="9">Rating: 9.x</option>
                    <option value="8">Rating: 8.x</option>
                  </select>
                </label>
                <label className="inline-flex items-center gap-1.5 text-sm text-slate-700">
                  <span className="sr-only">Room type for price filter</span>
                  <select
                    value={priceFilterRoom}
                    onChange={(e) =>
                      setPriceFilterRoom(e.target.value as "1" | "2" | "3")
                    }
                    className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-50"
                  >
                    <option value="1">Price ≤ · 1 room</option>
                    <option value="2">Price ≤ · 2 rooms</option>
                    <option value="3">Price ≤ · 3 rooms</option>
                  </select>
                </label>
                <label className="relative inline-flex min-w-[9rem] flex-1 items-center text-sm text-slate-700 sm:max-w-[12rem]">
                  <span className="sr-only">Maximum price</span>
                  <input
                    inputMode="numeric"
                    value={formatPriceInput(priceMax)}
                    onChange={(e) =>
                      setPriceMax(parsePriceDigits(e.target.value))
                    }
                    placeholder="Max price"
                    className="w-full rounded-xl border border-slate-300 bg-white py-1.5 pl-3 pr-7 text-sm"
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-slate-400">
                    ₽
                  </span>
                </label>
              </div>
              {sortField === "best" ? (
                <label className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-700">
                  <span className="shrink-0 font-medium text-slate-800">
                    Best mix
                  </span>
                  <span className="tabular-nums text-slate-600">
                    Price {bestPricePercent}%
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={bestPricePercent}
                    onChange={(e) =>
                      updateBestPricePercent(Number(e.target.value))
                    }
                    className="h-2 w-40 max-w-full accent-teal-600"
                    aria-valuetext={`${bestPricePercent}% price, ${100 - bestPricePercent}% weighted rating`}
                  />
                  <span className="tabular-nums text-slate-600">
                    Weighted {100 - bestPricePercent}%
                  </span>
                </label>
              ) : null}
            </div>
          ) : null}

          {notes.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">
              {isPublicViewer
                ? catalogReady
                  ? "No hotels here yet. The viewer shares data with the full app only on the same port (5174) — stop npm run dev:web, then npm run dev:viewer. Or Export from the full app and run prepare:public-shortlist."
                  : "Loading…"
                : "None yet. Export downloads a backup JSON; Import restores it."}
            </p>
          ) : sorted.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">
              {listFiltered
                ? "No hotels match the current filters."
                : "No hotels to show."}
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
                        : n.disliked
                          ? "border-slate-200 bg-slate-100/80 opacity-70"
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
                        <button
                          type="button"
                          className={`shrink-0 rounded p-0.5 ${
                            n.disliked
                              ? "text-slate-600 hover:text-slate-700"
                              : "text-slate-300 hover:text-slate-500"
                          }`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleDisliked(n.id);
                          }}
                          aria-label={
                            n.disliked
                              ? `Undo dislike for ${n.name}`
                              : `Dislike ${n.name} — sort to bottom`
                          }
                          aria-pressed={n.disliked}
                          title={
                            n.disliked
                              ? "Undo dislike"
                              : "Dislike (sort to bottom)"
                          }
                        >
                          <ThumbsDownIcon
                            filled={n.disliked}
                            className="h-5 w-5"
                          />
                        </button>
                        <span
                          className="cursor-pointer font-semibold text-teal-800 hover:underline"
                          title="Edit hotel details"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!isPublicViewer) handleEdit(n);
                          }}
                        >
                          {n.name}
                        </span>
                      </div>
                      {(() => {
                        const quality = formatHotelQuality(
                          n,
                          weightedRating(n.rating, n.reviewCount, ratingPrior),
                        );
                        return quality ? (
                          <p className="mt-0.5 text-sm text-slate-500">
                            {quality}
                          </p>
                        ) : null;
                      })()}
                      <div className="mt-1 text-sm text-slate-600">
                        {(() => {
                          const flash =
                            priceFlashById[n.id] ?? priceFlashFromHistory(n);
                          return [
                            formatPriceSlot(
                              "1 room",
                              n.priceOneRoom,
                              n.operatorOneRoom,
                              n.priceHistoryOneRoom,
                              flash?.one,
                            ),
                            formatPriceSlot(
                              "2 rooms",
                              n.priceTwoRooms,
                              n.operatorTwoRooms,
                              n.priceHistoryTwoRooms,
                              flash?.two,
                            ),
                            formatPriceSlot(
                              "3 rooms",
                              n.priceThreeRooms,
                              n.operatorThreeRooms,
                              n.priceHistoryThreeRooms,
                              flash?.three,
                            ),
                          ]
                            .filter(Boolean)
                            .map((node, i) => <div key={i}>{node}</div>);
                        })()}
                      </div>
                      {!isPublicViewer && inlineNoteId === n.id ? (
                        <div
                          className="mt-1"
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                        >
                          <textarea
                            autoFocus
                            rows={2}
                            className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800"
                            value={inlineNoteDraft}
                            placeholder="Add note…"
                            aria-label={`Note for ${n.name}`}
                            onChange={(e) =>
                              setInlineNoteDraft(e.target.value)
                            }
                            onBlur={() => saveInlineNote(n.id)}
                            onKeyDown={(e) => {
                              if (e.key === "Escape") {
                                e.preventDefault();
                                cancelInlineNote();
                              }
                              if (
                                e.key === "Enter" &&
                                (e.metaKey || e.ctrlKey)
                              ) {
                                e.preventDefault();
                                (e.target as HTMLTextAreaElement).blur();
                              }
                            }}
                          />
                        </div>
                      ) : n.notes ? (
                        <p className="mt-1 text-sm text-slate-700">{n.notes}</p>
                      ) : null}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-center gap-0.5">
                      {!isPublicViewer ? (
                        <>
                      <button
                        type="button"
                        className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                        disabled={
                          !n.tourRequestUrl.trim() ||
                          refreshingId === n.id ||
                          bulkRefreshing
                        }
                        title={
                          bulkRefreshing
                            ? "Refresh all in progress"
                            : n.tourRequestUrl.trim()
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
                        title={n.notes ? "Edit note" : "Add note"}
                        aria-label={
                          n.notes
                            ? `Edit note for ${n.name}`
                            : `Add note for ${n.name}`
                        }
                        onClick={(e) => {
                          e.stopPropagation();
                          startInlineNote(n);
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
                        </>
                      ) : null}
                      {n.pageUrl ? (
                        <a
                          className="rounded p-1 text-teal-600 hover:bg-teal-50 hover:text-teal-800"
                          href={n.pageUrl}
                          target="_blank"
                          rel="noreferrer"
                          title="Open hotel page"
                          aria-label={`Open ${n.name} hotel page`}
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
          onToggleFavorite={handleToggleFavorite}
          onToggleDisliked={handleToggleDisliked}
        />
      </section>

      {!isPublicViewer ? (
        <>
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
        </>
      ) : null}
    </div>
  );
}
