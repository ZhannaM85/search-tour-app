import express from "express";
import cors from "cors";
import { z } from "zod";
import {
  extractFromTourRows,
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
