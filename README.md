# Hotel shortlist

Personal notes for hotels you already checked by hand.

1. On a hotel page, copy the tours request as cURL  
2. Paste it here → **Load name & coordinates**  
3. Enter price for 1 room and for 2 rooms, plus your notes  
4. Save — pins appear on the map  

A small local API runs the curl for you (browser CORS cannot call the tours host directly). Data stays in the browser (`localStorage`).

## Run

```bash
npm install
npm run dev:api
npm run dev:web
```

- API: http://localhost:8787  
- Web: http://localhost:5174  
