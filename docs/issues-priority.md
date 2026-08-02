# Issues Priority List

Issues grouped by implementation tier. Work top-to-bottom within each tier; dependencies are noted where order matters within a tier.

---

## Tier 1 — Shortlist integrity
_Keep the personal shortlist trustworthy as hotels are added from tour search._

| # | Status | Issue | Notes |
|---|--------|-------|-------|
| [#1](https://github.com/ZhannaM85/search-tour-app/issues/1) | 🔍 Pending validation | Tour search: don't allow duplicate hotels | On load, open existing match for edit (fresh prices + keep notes); Update saves in place. Match hotelId → pageUrl → name+coords. Awaiting confirmation before closing. |

---

## Tier 2 — Price from tour search
_Use the same curl response the app already fetches; stop asking for prices by hand once row mapping is known._

| # | Status | Issue | Notes |
|---|--------|-------|-------|
| [#2](https://github.com/ZhannaM85/search-tour-app/issues/2) | 🔧 In progress | Auto-fill tour prices (esp. 2 rooms) from curl response | Join hotel SSR `rooms[].roomCount` via GetTours `[44]` → price `[42]`. Fills 1 / 2 / 3 room cheapest prices. |
| [#4](https://github.com/ZhannaM85/search-tour-app/issues/4) | 🔍 Pending validation | Store tour operator with each captured price | Per-price operators from aaData[18]; form (read-only + pencil), list, map; persist/export. Awaiting confirmation before closing. |
| [#3](https://github.com/ZhannaM85/search-tour-app/issues/3) | ⬜ Open | Per-hotel price refresh icon (no bulk refresh) | **After #2.** Icon on each hotel row only; refresh that hotel’s prices. No bulk/all refresh |

---

## Tier 3 — Edit UX safety
_Prevent accidental loss of in-progress edits._

| # | Status | Issue | Notes |
|---|--------|-------|-------|
| [#5](https://github.com/ZhannaM85/search-tour-app/issues/5) | ⬜ Open | Confirm before Cancel edit discards unsaved changes | Modal (or confirm) when Cancel edit would drop dirty form fields |

---
