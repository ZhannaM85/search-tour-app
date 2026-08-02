import express from "express";
import cors from "cors";
import { z } from "zod";
import {
  extractFromTourRows,
  extractRoomCatalogFromHtml,
  normalizeCurlText,
  parseCurlRequest,
} from "./curl.js";

const PORT = Number(process.env.PORT ?? 8787);
const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: "4mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

async function fetchRoomCatalog(
  pageUrl: string,
  refererUrl: string,
  tourHeaders: Record<string, string>,
) {
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
      const catalog = extractRoomCatalogFromHtml(html);
      if (catalog.size > 0) return catalog;
    } catch {
      /* try next candidate */
    }
  }
  return new Map();
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

    const roomCatalog = await fetchRoomCatalog(
      extracted!.pageUrl,
      refererUrl,
      headers,
    );
    if (roomCatalog.size > 0) {
      extracted = extractFromTourRows(json, refererUrl, roomCatalog);
    }

    res.json({
      requestUrl: url,
      refererUrl,
      ...extracted!,
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
