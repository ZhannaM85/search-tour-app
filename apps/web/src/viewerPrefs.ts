import type { HotelNote } from "./types";

const VIEWER_PREFS_KEY = "hotel-shortlist.viewer-prefs.v1";

export type ViewerPref = {
  favorite: boolean;
  disliked: boolean;
};

export type ViewerPrefsMap = Record<string, ViewerPref>;

export function loadViewerPrefs(): ViewerPrefsMap {
  try {
    const raw = localStorage.getItem(VIEWER_PREFS_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const out: ViewerPrefsMap = {};
    for (const [id, value] of Object.entries(parsed)) {
      if (!value || typeof value !== "object") continue;
      const v = value as Record<string, unknown>;
      out[id] = {
        favorite: Boolean(v.favorite),
        disliked: Boolean(v.disliked),
      };
      // Mutual exclusion
      if (out[id].favorite && out[id].disliked) {
        out[id].disliked = false;
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function saveViewerPrefs(prefs: ViewerPrefsMap): void {
  localStorage.setItem(VIEWER_PREFS_KEY, JSON.stringify(prefs));
}

/** Snapshot pins ignored — each visitor starts clean, then merges their prefs. */
export function applyViewerPrefs(
  hotels: HotelNote[],
  prefs: ViewerPrefsMap,
): HotelNote[] {
  return hotels.map((h) => {
    const p = prefs[h.id];
    return {
      ...h,
      favorite: p?.favorite ?? false,
      disliked: p?.disliked ?? false,
    };
  });
}

export function setViewerFavorite(
  prefs: ViewerPrefsMap,
  id: string,
  favorite: boolean,
): ViewerPrefsMap {
  const prev = prefs[id] ?? { favorite: false, disliked: false };
  return {
    ...prefs,
    [id]: {
      favorite,
      disliked: favorite ? false : prev.disliked,
    },
  };
}

export function setViewerDisliked(
  prefs: ViewerPrefsMap,
  id: string,
  disliked: boolean,
): ViewerPrefsMap {
  const prev = prefs[id] ?? { favorite: false, disliked: false };
  return {
    ...prefs,
    [id]: {
      disliked,
      favorite: disliked ? false : prev.favorite,
    },
  };
}
