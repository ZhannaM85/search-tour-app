# Issues Priority List

Issues grouped by implementation tier. Work top-to-bottom within each tier; dependencies are noted where order matters within a tier.

---

## Tier 1 — Shortlist integrity
_Keep the personal shortlist trustworthy as hotels are added from tour search._

| # | Status | Issue | Notes |
|---|--------|-------|-------|
| [#1](https://github.com/ZhannaM85/search-tour-app/issues/1) | ⬜ Open | Tour search: don't allow duplicate hotels | Match on `hotelId` when present; block or update existing instead of creating a second UUID entry |

---

## Tier 2 — Price from tour search
_Use the same curl response the app already fetches; stop asking for prices by hand once row mapping is known._

| # | Status | Issue | Notes |
|---|--------|-------|-------|
| [#2](https://github.com/ZhannaM85/search-tour-app/issues/2) | ⬜ Open | Auto-fill tour prices (esp. 2 rooms) from curl response | Today only name/coords are parsed from `aaData[0]`. User will label first few hotels’ two-room tours; then update extraction algo |

---
