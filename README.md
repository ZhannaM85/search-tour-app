# Hotel shortlist

Personal notes for hotels you already checked by hand.

## Demo

![Demo](docs/demo.mp4)

1. On a hotel page, copy the tours request as cURL  
2. Paste it here → **Load name & coordinates**  
3. Enter price for 1 / 2 / 3 rooms (or load from curl), plus your notes  
4. Save — pins appear on the map; mark **Favorite** to pin hotels to the top of the list  
5. **Export** a JSON backup anytime; **Import** to restore after a reload or new device  

A small local API runs the curl for you (browser CORS cannot call the tours host directly). Data stays in the browser (`localStorage`) until you export it.

## Run

```bash
npm install
npm run dev:api
npm run dev:web
```

- API: http://localhost:8787  
- Web: http://localhost:5174  
