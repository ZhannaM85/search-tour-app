# Hotel shortlist

Personal notes for hotels you already checked by hand.

1. On a hotel page, copy the tours request as cURL  
2. Paste it here → **Load name & coordinates**  
3. Enter price for 1 / 2 / 3 rooms (or load from curl), plus your notes  
4. Save — pins appear on the map; mark **Favorite** to pin hotels to the top of the list  
5. **Export** a JSON backup anytime; **Import** to restore after a reload or new device  

A small local API runs the curl for you (browser CORS cannot call the tours host directly). Data stays in the browser (`localStorage`) until you export it.

## Run (full app)

```bash
npm install
npm run dev:api
npm run dev:web
```

- API: http://localhost:8787  
- Web: http://localhost:5174  

## Read-only viewer (local preview)

Same list/map/sort UI without add/edit/refresh. Favorites and dislikes are stored in **this browser only** (separate from your full-app shortlist).

**Important:** the full app and viewer must use the **same origin** (`http://localhost:5174`) to share your shortlist. Different ports have separate `localStorage`.

```bash
# Stop npm run dev:web first (port 5174), then:
npm run dev:viewer
```

- Viewer: http://localhost:5174  

If [`shortlist.json`](apps/web/public/shortlist.json) is empty, the viewer previews hotels from the full app’s `localStorage` on that same port.

**For a publishable snapshot** (later for GitHub Pages):

1. In the full app, click **Export**
2. `npm run prepare:public-shortlist -- path/to/hotel-shortlist-YYYY-MM-DD.json`
3. Refresh the viewer (or commit the JSON for Pages)
