# Issues Priority List

Issues grouped by implementation tier. Work top-to-bottom within each tier; dependencies are noted where order matters within a tier.

---

## Tier 1 — Shortlist integrity
_Keep the personal shortlist trustworthy as hotels are added from tour search._

| # | Status | Issue | Notes |
|---|--------|-------|-------|
| [#1](https://github.com/ZhannaM85/search-tour-app/issues/1) | ✅ Done | Tour search: don't allow duplicate hotels | On load, open existing match for edit (fresh prices + keep notes); Update saves in place. Match hotelId → pageUrl → name+coords |

---

## Tier 2 — Price from tour search
_Use the same curl response the app already fetches; stop asking for prices by hand once row mapping is known._

| # | Status | Issue | Notes |
|---|--------|-------|-------|
| [#2](https://github.com/ZhannaM85/search-tour-app/issues/2) | ✅ Done | Auto-fill tour prices (esp. 2 rooms) from curl response | Join `rooms[].roomCount` via `[44]`. Price = full `[88]` (not promo `[42]`). Honor referer `operatorIds` / `mealsIds` |
| [#4](https://github.com/ZhannaM85/search-tour-app/issues/4) | ✅ Done | Store tour operator with each captured price | Per-price operators from aaData[18]; form (read-only + pencil), list, map; persist/export |
| [#3](https://github.com/ZhannaM85/search-tour-app/issues/3) | ✅ Done | Per-hotel price refresh icon (no bulk refresh) | Stored `tourRequestUrl`+`tourRefererUrl`; refresh prices/operators only; capped history (10) per room count; strikethrough flash |
| [#7](https://github.com/ZhannaM85/search-tour-app/issues/7) | ✅ Done | Populate hotel stars, rating, and vote count | From hotel-page SSR (`category.name`, `rate`, `reviewCount`); not in GetTours IDX. Shown as `5★ · 9.58 (388)` in form/list/map; refresh updates too |

---

## Tier 3 — Edit UX safety
_Prevent accidental loss of in-progress edits and destructive actions._

| # | Status | Issue | Notes |
|---|--------|-------|-------|
| [#5](https://github.com/ZhannaM85/search-tour-app/issues/5) | ✅ Done | Confirm before Cancel edit discards unsaved changes | Dirty check vs edit baseline; ConfirmDialog only when dirty |
| [#10](https://github.com/ZhannaM85/search-tour-app/issues/10) | ✅ Done | Confirm deletion with an in-app modal | Shared ConfirmDialog; Cancel / Delete |

---

## Tier 4 — Display polish
_Small presentation fixes from live use._

| # | Status | Issue | Notes |
|---|--------|-------|-------|
| [#6](https://github.com/ZhannaM85/search-tour-app/issues/6) | ✅ Done | Sort displayed room prices by room count (1 → 2 → 3) | Map popup now 1 → 2 → 3 (list already was) |
| [#8](https://github.com/ZhannaM85/search-tour-app/issues/8) | ✅ Done | Add sorting by hotel name | Name A→Z via localeCompare; favorites still pin first |
| [#9](https://github.com/ZhannaM85/search-tour-app/issues/9) | ✅ Done | Replace row actions Refresh/Edit/Delete/Open with icons | Icon buttons + aria-labels; refresh spins while loading |

---

## Tier 5 — Refresh correctness
_Make per-hotel price refresh trustworthy when offers change or disappear._

| # | Status | Issue | Notes |
|---|--------|-------|-------|
| [#11](https://github.com/ZhannaM85/search-tour-app/issues/11) | ✅ Done | Refresh icon does not update hotel prices | Fresh GetTours via `requestId=0`, then poll; validated live (price flash) |
| [#12](https://github.com/ZhannaM85/search-tour-app/issues/12) | ⬜ Open | Clear stale room prices when refresh finds no offer | e.g. no 2-room offer anymore → clear price/operator + warn; apply to 1/2/3 |

---
