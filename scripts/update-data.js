// Descarga el Load-to-Truck semanal de DAT y lo guarda en data/lt-weekly-<EQUIPO>.json.
// Lo corre GitHub Actions cada 6 horas; la herramienta lee estos archivos directo de GitHub (sin servidor que despertar).
const fs = require("fs");
const URL = "https://analytics.api.dat.com/v2/trendlines/%s/loadAndTruckRatio";

async function main() {
  let changed = 0;
  for (const eq of ["VAN", "REEFER", "FLATBED"]) {
    const r = await fetch(URL.replace("%s", eq), { headers: { Accept: "application/json" } });
    if (!r.ok) throw new Error(`${eq}: DAT respondió ${r.status}`);
    const d = await r.json();
    const weeks = (d.oneMonthWeekly || [])
      .filter((w) => w && w.weekEndingWhen && typeof w.ratio === "number")
      .slice(-8)
      .map((w) => ({ weekEnding: w.weekEndingWhen, ratio: Math.round(w.ratio * 100) / 100 }));
    if (weeks.length < 4) throw new Error(`${eq}: DAT devolvió ${weeks.length} semanas`);
    const file = `data/lt-weekly-${eq}.json`;
    const prev = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
    if (prev && JSON.stringify(prev.weeks) === JSON.stringify(weeks)) continue;   // sin cambios: no se escribe
    fs.writeFileSync(file, JSON.stringify({ equipment: eq, weeks, source: "DAT Trendlines", updatedAt: new Date().toISOString() }, null, 2) + "\n");
    changed++;
  }
  console.log(changed ? `actualizados: ${changed}` : "sin cambios");
}
main().catch((e) => { console.error(e); process.exit(1); });
