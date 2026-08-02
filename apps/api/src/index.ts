import express from "express";
import cors from "cors";
import { z } from "zod";
import {
  extractFromTourRows,
  extractHotelPageDataFromHtml,
  normalizeCurlText,
  parseCurlRequest,
  type HotelPageExtract,
} from "./curl.js";

const PORT = Number(process.env.PORT ?? 8787);
const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: "4mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

function emptyHotelPage(): HotelPageExtract {
  return {
    rooms: new Map(),
    stars: null,
    rating: null,
    reviewCount: null,
  };
}

async function fetchHotelPageData(
  pageUrl: string,
  refererUrl: string,
  tourHeaders: Record<string, string>,
): Promise<HotelPageExtract> {
  const candidates = [refererUrl, pageUrl].filter(
    (u) => typeof u === "string" && /^https?:\/\//i.test(u),
  );
  const seen = new Set<string>();
  const htmlHeaders: Record<string, string> = {
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "User-Agent":
      tourHeaders["User-Agent"] ??
      tourHeaders["user-agent"] ??
      "Mozilla/5.0 (compatible; search-tour-app)",
  };
  const lang = tourHeaders["Accept-Language"] ?? tourHeaders["accept-language"];
  if (lang) htmlHeaders["Accept-Language"] = lang;

  let best = emptyHotelPage();
  for (const candidate of candidates) {
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    try {
      const res = await fetch(candidate, {
        method: "GET",
        headers: htmlHeaders,
        redirect: "follow",
      });
      if (!res.ok) continue;
      const html = await res.text();
      const data = extractHotelPageDataFromHtml(html);
      if (data.rooms.size > 0) return data;
      if (
        best.stars == null &&
        best.rating == null &&
        best.reviewCount == null &&
        (data.stars != null || data.rating != null || data.reviewCount != null)
      ) {
        best = data;
      }
    } catch {
      /* try next candidate */
    }
  }
  return best;
}

app.post("/api/parse-tour-curl", async (req, res) => {
  try {
    const body = z.object({ curl: z.string().min(1) }).parse(req.body);
    const text = normalizeCurlText(body.curl);
    const { url, headers, refererUrl } = parseCurlRequest(text);

    const upstream = await fetch(url, {
      method: "GET",
      headers,
    });
    if (!upstream.ok) {
      res.status(502).json({
        error: `Upstream HTTP ${upstream.status}`,
      });
      return;
    }

    let json: unknown = await upstream.json();
    let extracted;
    try {
      extracted = extractFromTourRows(json, refererUrl);
    } catch (firstErr) {
      // First response can be empty while operators are still loading.
      let lastErr = firstErr;
      for (let attempt = 0; attempt < 3; attempt++) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        const retry = await fetch(url, { method: "GET", headers });
        if (!retry.ok) continue;
        json = await retry.json();
        try {
          extracted = extractFromTourRows(json, refererUrl);
          lastErr = null;
          break;
        } catch (err) {
          lastErr = err;
        }
      }
      if (lastErr) throw lastErr;
    }

    const page = await fetchHotelPageData(
      extracted!.pageUrl,
      refererUrl,
      headers,
    );
    if (page.rooms.size > 0) {
      extracted = extractFromTourRows(json, refererUrl, page.rooms);
    }

    res.json({
      requestUrl: url,
      refererUrl,
      ...extracted!,
      stars: page.stars,
      rating: page.rating,
      reviewCount: page.reviewCount,
    });
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

const BROWSER_HEADERS: Record<string, string> = {
  Accept: "application/json, text/plain, */*",
  "Content-Type": "application/json",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
  "Accept-Language": "en,en-US;q=0.9,ru;q=0.8",
  Origin: "https://sletat.ru",
};

app.post("/api/refresh-hotel-prices", async (req, res) => {
  try {
    const body = z
      .object({
        requestUrl: z.string().url(),
        refererUrl: z.string(),
      })
      .parse(req.body);

    const headers: Record<string, string> = {
      ...BROWSER_HEADERS,
    };
    if (body.refererUrl) headers.Referer = body.refererUrl;

    const upstream = await fetch(body.requestUrl, {
      method: "GET",
      headers,
    });
    if (!upstream.ok) {
      res.status(502).json({
        error: `Upstream HTTP ${upstream.status}`,
      });
      return;
    }

    let json: unknown = await upstream.json();
    let extracted;
    try {
      extracted = extractFromTourRows(json, body.refererUrl);
    } catch (firstErr) {
      let lastErr = firstErr;
      for (let attempt = 0; attempt < 3; attempt++) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        const retry = await fetch(body.requestUrl, {
          method: "GET",
          headers,
        });
        if (!retry.ok) continue;
        json = await retry.json();
        try {
          extracted = extractFromTourRows(json, body.refererUrl);
          lastErr = null;
          break;
        } catch (err) {
          lastErr = err;
        }
      }
      if (lastErr) throw lastErr;
    }

    const page = await fetchHotelPageData(
      extracted!.pageUrl,
      body.refererUrl,
      headers,
    );
    if (page.rooms.size > 0) {
      extracted = extractFromTourRows(json, body.refererUrl, page.rooms);
    }

    res.json({
      priceOneRoom: extracted!.priceOneRoom,
      priceTwoRooms: extracted!.priceTwoRooms,
      priceThreeRooms: extracted!.priceThreeRooms,
      operatorOneRoom: extracted!.operatorOneRoom,
      operatorTwoRooms: extracted!.operatorTwoRooms,
      operatorThreeRooms: extracted!.operatorThreeRooms,
      stars: page.stars,
      rating: page.rating,
      reviewCount: page.reviewCount,
    });
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
});
