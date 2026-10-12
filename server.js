// Market Update DAT proxy
// Devuelve el Load-to-Truck Ratio semanal de DAT con CORS abierto, para que el Market Update Builder
// (que corre en el navegador) pueda leerlo. Solo expone esa ruta; no es un proxy abierto.
// Sin dependencias. Pensado para correr solo, sin monitoreo: caché en memoria y, si DAT falla,
// devuelve el último dato bueno.

const http = require("http");

const PORT = process.env.PORT || 10000;
const UPSTREAM = "https://analytics.api.dat.com/v2/trendlines/%s/loadAndTruckRatio";
const EQUIPMENT = new Set(["VAN", "REEFER", "FLATBED"]);
const TTL_MS = 60 * 60 * 1000;          // DAT actualiza una vez por semana; 1 h alcanza
const TIMEOUT_MS = 15000;
const cache = new Map();                // equipo → { at, body }

const HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "public, max-age=900",
};

function send(res, status, obj) {
  res.writeHead(status, HEADERS);
  res.end(JSON.stringify(obj));
}

async function fetchWeekly(equipment) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(UPSTREAM.replace("%s", equipment), {
      signal: ctrl.signal,
      headers: { Accept: "application/json", "User-Agent": "market-update-builder/1.0" },
    });
    if (!r.ok) throw new Error(`DAT respondió ${r.status}`);
    const data = await r.json();
    const weeks = (data.oneMonthWeekly || [])
      .filter((w) => w && w.weekEndingWhen && typeof w.ratio === "number")
      .slice(-8)
      .map((w) => ({ weekEnding: w.weekEndingWhen, ratio: Math.round(w.ratio * 100) / 100 }));
    if (!weeks.length) throw new Error("DAT no devolvió semanas");
    return { equipment, weeks, source: "DAT Trendlines", fetchedAt: new Date().toISOString() };
  } finally {
    clearTimeout(timer);
  }
}

async function weekly(equipment) {
  const hit = cache.get(equipment);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.body;
  try {
    const body = await fetchWeekly(equipment);
    cache.set(equipment, { at: Date.now(), body });
    return body;
  } catch (e) {
    if (hit) return { ...hit.body, stale: true, error: String(e.message || e) };   // último dato bueno
    throw e;
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (req.method === "OPTIONS") return send(res, 204, {});
  if (req.method !== "GET") return send(res, 405, { error: "method not allowed" });
  if (url.pathname === "/" || url.pathname === "/health") return send(res, 200, { ok: true, service: "market-update-dat-proxy" });
  const m = url.pathname.match(/^\/lt-weekly\/([A-Za-z]+)$/);
  if (!m) return send(res, 404, { error: "not found" });
  const equipment = m[1].toUpperCase();
  if (!EQUIPMENT.has(equipment)) return send(res, 400, { error: "equipment must be VAN, REEFER or FLATBED" });
  try {
    send(res, 200, await weekly(equipment));
  } catch (e) {
    send(res, 502, { error: "DAT unavailable", detail: String(e.message || e) });
  }
});

server.requestTimeout = 30000;
server.listen(PORT, () => console.log(`DAT proxy escuchando en :${PORT}`));
process.on("uncaughtException", (e) => console.error("error no controlado:", e));   // nunca se cae
process.on("unhandledRejection", (e) => console.error("promesa rechazada:", e));
