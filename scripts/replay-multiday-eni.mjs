#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// REPLAY FEDELE del giro reale ENI 202609 (Diagnostica del 2026-09-06).
//
// A COSA SERVE: docs/MULTI_GIORNO.md dice che i test offline con la linea d'aria
// NON riproducono la produzione, e che senza una riproduzione fedele ogni taratura
// del clustering è una scommessa (più volte una modifica "buona" offline è
// peggiorata sul giro vero). Questo script chiude quel buco: ricostruisce i tempi
// REALI dal log, sostituisce le chiamate Google con uno stub su quella matrice, e
// fa girare il MOTORE VERO (server/multiDayPlanner.js) verificando che riproduca i
// fatti del log.
//
// DAL v5.123 (variante ESTREMI) il motore dà 3/6/8 con 1023' di guida: i controlli di fedeltà
// qui sotto valgono per il motore SENZA la variante. Per riprodurli:
//   git show eb5ba65:server/multiDayPlanner.js > /tmp/md122.js && node scripts/replay-multiday-eni.mjs /tmp/md122.js
// (nota: il file estratto importa "./planner.js", quindi va messo accanto a una copia di server/planner.js)
//
// FEDELTÀ RAGGIUNTA col motore v5.122 (DUR=10, valori di default):
//   ✓ 4 zone con gli stessi membri del log
//   ✓ composizione 1/13/3
//   ✓ Malé isolata, 07:00–10:32 (log 10:38)
//   ✓ partenza della giornata da 13 tappe alle 05:22 — IDENTICA al log
//     (firma forte: significa che casa→Silandro e il calcolo a ritroso combaciano)
//   ~ km 886 contro 939 del log (−5,6%): lo scarto viene dalla conversione
//     tempo→km dello stub, NON dalle decisioni di clustering, che usano i tempi.
//
// USO:
//   node scripts/replay-multiday-eni.mjs                    # motore attuale
//   node scripts/replay-multiday-eni.mjs /percorso/alt.js   # confronta una variante
//   DUR=10 CV=115 KMH=58 node scripts/replay-multiday-eni.mjs
//
// DUR = durata dell'intervento (il log non la stampa). DUR=10 è il valore che
// riproduce il log: sono stazioni di servizio, visite rapide. Con DUR≥15 il motore
// dà 4 giornate 9/1/4/3, quindi il parametro va tenuto a 10 per il confronto.
// ─────────────────────────────────────────────────────────────────────────────

process.env.GOOGLE_MAPS_API_KEY = "FAKE";
const CV = Number(process.env.CV || 115);
const KMH = Number(process.env.KMH || 58);
const DUR = Number(process.env.DUR || 10);
const PLANNER = process.argv[2] || new URL("../server/multiDayPlanner.js", import.meta.url).pathname;

// ── nodi e tempi da casa (riga GEOMETRIA del log, minuti col buffer) ──────────
const NAMES = ["Canazei","Silandro","Vipiteno","Male","Cavalese","Bolzano_A","ENIMOOV",
  "Bolzano_B","Ala","Rovereto_A","San_Michele","Rovereto_B","Borgo","Trento_A","Trento_B",
  "Civezzano","Ravina"];
const NODES = ["home", ...NAMES];
const IDX = Object.fromEntries(NODES.map((n, i) => [n, i]));
const HOME_T = { Canazei:127, Silandro:118, Vipiteno:118, Male:100, Cavalese:81,
  Bolzano_A:72, ENIMOOV:69, Bolzano_B:69, Ala:54, Rovereto_A:40, San_Michele:39,
  Rovereto_B:33, Borgo:32, Trento_A:27, Trento_B:23, Civezzano:23, Ravina:21 };

// ── vicini più prossimi (riga VICINI del log) ────────────────────────────────
const NN = [
  ["Silandro","Bolzano_A",63], ["Bolzano_A","ENIMOOV",8], ["Vipiteno","ENIMOOV",67],
  ["Ala","Rovereto_A",19], ["Rovereto_A","Rovereto_B",9], ["Ravina","Trento_B",11],
  ["Borgo","Civezzano",33], ["Trento_A","Trento_B",7], ["Cavalese","San_Michele",53],
  ["Canazei","Cavalese",55], ["San_Michele","Trento_B",18], ["ENIMOOV","Bolzano_B",1],
  ["Civezzano","Trento_B",18], ["Male","San_Michele",71],
];

// ── ANCORAGGI: archi che il log non stampa (stampa solo il vicino più prossimo)
// ma che i suoi stessi fatti impongono. Senza, il grafo sparso farebbe passare da
// CASA ogni coppia sullo stesso asse, gonfiando i tempi e falsando il clustering.
const ANCHORS = [
  ["Cavalese","Bolzano_A",58], ["Cavalese","Bolzano_B",58],
  ["Bolzano_A","San_Michele",35], ["Bolzano_B","San_Michele",35],
  ["Rovereto_A","Ravina",22], ["Rovereto_B","Ravina",22],
  ["Rovereto_A","Trento_A",25], ["Rovereto_A","Trento_B",25],
  ["Rovereto_B","Trento_A",25], ["Rovereto_B","Trento_B",25],
  ["Ala","Trento_A",35], ["Ala","Trento_B",35],
];

// il log stampa tempi col buffer traffico (+1/6); lo stub deve dare i minuti grezzi
const rawOf = buf => Math.round(buf * 6 / 7);

function buildRaw(cv = CV) {
  const n = NODES.length;
  const D = Array.from({ length: n }, () => Array(n).fill(Infinity));
  for (let i = 0; i < n; i++) D[i][i] = 0;
  const put = (a, b, buf) => { const i = IDX[a], j = IDX[b], v = rawOf(buf);
    if (v < D[i][j]) { D[i][j] = v; D[j][i] = v; } };
  for (const [k, v] of Object.entries(HOME_T)) put("home", k, v);
  for (const [a, b, v] of NN) put(a, b, v);
  put("Silandro", "Bolzano_B", 63);   // "Silandro→Bolzano 63" è ambiguo: vale per entrambi
  for (const [a, b, v] of ANCHORS) put(a, b, v);
  // Z4[Canazei]={Canazei,Vipiteno,Cavalese} impone d(Vipiteno,Canazei) ≤ 118
  if (cv != null) put("Canazei", "Vipiteno", cv);
  for (let k = 0; k < n; k++) for (let i = 0; i < n; i++) for (let j = 0; j < n; j++)
    if (D[i][k] + D[k][j] < D[i][j]) D[i][j] = D[i][k] + D[k][j];
  return D;
}

// ── stub di Google Directions sulla matrice ricostruita ──────────────────────
const D = buildRaw();
const COORD = NODES.map((_, i) => ({ lat: 46 + i * 0.03, lng: 11 + i * 0.03 }));
const ckey = (la, ln) => `${Math.round(la * 1000)}_${Math.round(ln * 1000)}`;
const byCoord = new Map(COORD.map((c, i) => [ckey(c.lat, c.lng), i]));
let misses = 0;
globalThis.fetch = async (url) => {
  const u = String(url);
  if (!u.includes("maps.googleapis.com/maps/api/directions/json"))
    return { ok: false, json: async () => ({ status: "ZERO_RESULTS" }) };
  const q = new URL(u).searchParams;
  const [oa, ob] = q.get("origin").split(",").map(Number);
  const [da, db] = q.get("destination").split(",").map(Number);
  const i = byCoord.get(ckey(oa, ob)), j = byCoord.get(ckey(da, db));
  if (i == null || j == null) { misses++; return { ok: false, json: async () => ({ status: "NOT_FOUND" }) }; }
  const raw = D[i][j];
  return { ok: true, json: async () => ({ status: "OK",
    routes: [{ legs: [{ distance: { value: Math.round(raw / 60 * KMH * 1000) }, duration: { value: raw * 60 } }] }] }) };
};

// ── tappe: orari come nel log (Silandro esplicito, Malé/Canazei "Non indicato") ─
const ORARI = {
  Silandro: { openMorning: "07:30", closeMorning: "12:30", openAfternoon: "14:30", closeAfternoon: "18:30" },
  Male: {}, Canazei: {},
};
const DEF = { openMorning: "08:30", closeMorning: "13:30", openAfternoon: "14:45", closeAfternoon: "16:55" };
const stops = NAMES.map((n, k) => ({
  uid: n, customer: n === "ENIMOOV" ? "Distributore ENIMOOV - ADW snc" : "Eni Station",
  location: n.replace(/_[AB]$/, "").replace(/_/g, " "),
  fullAddress: `${n}, TN`, lat: COORD[k + 1].lat, lng: COORD[k + 1].lng,
  durationMinutes: DUR, ...(ORARI[n] ?? DEF),
}));
const home = { label: "Casa", address: "Vigolo Vattaro", lat: COORD[0].lat, lng: COORD[0].lng };
const SETTINGS = { maxReturnTime: "18:30", lunchBreakEnabled: true, lunchBreakMinutes: 60,
  restIntervalMin: 120, restDurationMin: 15, driveMarkupMinPerHour: 10,
  kmRate: 0.65, driveHourRate: 22, workHourRate: 60 };

const { planMultiDay } = await import(PLANNER);
const res = await planMultiDay({
  stops, start: home, end: { sameAsStart: true }, startTime: "07:00",
  scheduledDate: "2026-09-06", lunchBreak: true, lunchBreakMinutes: 60, departureLatest: "18:30",
}, SETTINGS, []);

// ── confronto con i fatti del log ────────────────────────────────────────────
const comp = res.days.map(d => d.stops.length).join("/");
const km = res.days.reduce((n, d) => n + Number(d.plan?.summary?.totalKm || 0), 0);
const zoneLine = (res.debug || []).find(l => l.startsWith("ZONE ")) || "(nessuna riga ZONE)";
const maleDay = res.days.find(d => d.stops.length === 1 && d.stops[0].location === "Male");
const big = res.days.find(d => d.stops.length >= 10);

console.log(`=== REPLAY ENI 202609 — motore: ${PLANNER.split("/").slice(-1)[0]} (DUR=${DUR}) ===`);
if (misses) console.log(`⚠️  stub: ${misses} coppie non risolte`);
console.log(`\n${zoneLine.slice(0, 320)}\n`);
console.log(`giornate: ${res.days.length} | composizione: ${comp} | km: ${km.toFixed(1)}`);
for (const d of res.days) {
  console.log(`  G${d.dayNumber}: ${String(d.stops.length).padStart(2)} tappe  ` +
    `${d.plan?.summary?.dayStart}-${d.plan?.summary?.dayEnd}  ` +
    `${Number(d.plan?.summary?.totalKm || 0).toFixed(0).padStart(3)} km  ` +
    `[${d.stops.map(s => s.location).join(", ").slice(0, 80)}]`);
}
for (const l of (res.debug || []).filter(l => /^(VARIANTE|DISSOLUZIONE|GIORNATA ESTREMI|UNIONE|   )/.test(l))) console.log(l);

const V123 = comp === "3/6/8";
console.log(V123 ? "\n=== v5.123: variante ESTREMI attiva — atteso 3/6/8, guida 1023' (1/13/3 era il motore v5.122) ===" : "\n=== FEDELTÀ vs LOG REALE (motore senza ESTREMI) ===");
const ck = (nome, ok, atteso, avuto) => console.log(`  ${ok ? "✓" : "✗"} ${nome}: atteso ${atteso} — ottenuto ${avuto}`);
if (V123) { ck("composizione v5.123", true, "3/6/8", comp); process.exit(0); }
ck("numero giornate", res.days.length === 3, 3, res.days.length);
ck("composizione", comp === "1/13/3", "1/13/3", comp);
ck("4 zone", /ZONE \(4,/.test(zoneLine), "4", (zoneLine.match(/ZONE \((\d+),/) || [])[1] || "?");
ck("Malé isolata", !!maleDay, "giornata da 1 tappa", maleDay ? `sì (${maleDay.plan?.summary?.dayStart}-${maleDay.plan?.summary?.dayEnd})` : "no");
ck("partenza 13-tappe 05:22", big?.plan?.summary?.dayStart === "05:22", "05:22", big?.plan?.summary?.dayStart ?? "—");
console.log(`  ~ km: log 939 — ottenuto ${km.toFixed(1)} (scarto dalla conversione tempo→km dello stub)`);
