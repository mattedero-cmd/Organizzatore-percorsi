import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  initDb,
  listAddresses,
  createAddress,
  updateAddress,
  deleteAddress,
  getSettings,
  updateSettings,
  saveRoute,
  listRoutes,
  getRoute,
  updateRoutePayload,
  renameRoute,
  deleteRoute
} from "./db.js";
import { loadEnv } from "./env.js";
import { planRoute } from "./planner.js";
import { routeShape } from "./googleMapsService.js";
import { parseVoiceCommand } from "./voiceParser.js";
import { attachWeather, shouldRefreshWeather } from "./weatherService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const publicDir = path.join(rootDir, "public");

loadEnv(rootDir);
await initDb(rootDir);

const PORT = Number(process.env.PORT || 5174);
const HOST = process.env.HOST || (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg"
};

function sendJson(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function parseBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 2_000_000) {
        request.destroy();
        reject(new Error("Payload troppo grande"));
      }
    });
    request.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("JSON non valido"));
      }
    });
    request.on("error", reject);
  });
}

function serveStatic(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const safePath = path.normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(publicDir, safePath);

  if (!filePath.startsWith(publicDir)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }
    response.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream"
    });
    response.end(content);
  });
}

async function handleApi(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const method = request.method || "GET";

  try {
    if (method === "GET" && url.pathname === "/api/health") {
      return sendJson(response, 200, {
        ok: true,
        mapApiConfigured: Boolean(process.env.GOOGLE_MAPS_API_KEY),
        whisperConfigured: Boolean(process.env.OPENAI_API_KEY)
      });
    }


    if (method === "GET" && url.pathname === "/api/config") {
      return sendJson(response, 200, {
        googleMapsKey: process.env.GOOGLE_MAPS_API_KEY || ""
      });
    }

    if (method === "GET" && url.pathname === "/api/addresses") {
      const addresses = await listAddresses(url.searchParams.get("search") || "");
      return sendJson(response, 200, addresses);
    }

    if (method === "POST" && url.pathname === "/api/addresses") {
      const body = await parseBody(request);
      if (!body.fullAddress) return sendJson(response, 400, { error: "Indirizzo completo obbligatorio" });
      const address = await createAddress(body);
      return sendJson(response, 201, address);
    }

    const addressMatch = url.pathname.match(/^\/api\/addresses\/(\d+)$/);
    if (addressMatch && method === "PUT") {
      const body = await parseBody(request);
      const address = await updateAddress(addressMatch[1], body);
      return sendJson(response, 200, address);
    }

    if (addressMatch && method === "DELETE") {
      await deleteAddress(addressMatch[1]);
      return sendJson(response, 200, { ok: true });
    }

    if (method === "GET" && url.pathname === "/api/settings") {
      return sendJson(response, 200, await getSettings());
    }

    if (method === "PUT" && url.pathname === "/api/settings") {
      const body = await parseBody(request);
      return sendJson(response, 200, await updateSettings(body));
    }

    if (method === "POST" && url.pathname === "/api/plan") {
      const body = await parseBody(request);
      const settings = await getSettings();
      const allAddresses = await listAddresses("");
      let route = await planRoute(body, settings, allAddresses);
      route = await attachWeather(route, { rowTimeoutMs: 3000 });
      const saved = await saveRoute({
        ...route,
        name: body.name || "Percorso giornaliero",
        scheduledDate: route.scheduledDate,
        startLabel: body.start?.label || "",
        startAddress: body.start?.address || body.start?.fullAddress || "",
        endLabel: route.end?.label || "",
        endAddress: route.end?.address || route.end?.fullAddress || ""
      });
      route.id = saved.id;
      return sendJson(response, 200, route);
    }

    if (method === "POST" && url.pathname === "/api/route-shape") {
      const body = await parseBody(request);
      return sendJson(response, 200, await routeShape(body.points || []));
    }

    if (method === "GET" && url.pathname === "/api/routes") {
      return sendJson(response, 200, await listRoutes());
    }

    const routeMatch = url.pathname.match(/^\/api\/routes\/(\d+)$/);
    if (routeMatch && method === "GET") {
      const stored = await getRoute(routeMatch[1]);
      if (!stored) return sendJson(response, 404, { error: "Giro non trovato" });
      let route = { ...stored.payload, id: stored.id };
      if (shouldRefreshWeather(route)) {
        route = await attachWeather(route, {
          existingWeather: route.weather || [],
          rowTimeoutMs: 3000
        });
        await updateRoutePayload(stored.id, route);
      }
      return sendJson(response, 200, route);
    }

    if (routeMatch && method === "PUT") {
      const body = await parseBody(request);
      const route = await renameRoute(routeMatch[1], body.name || "");
      if (!route) return sendJson(response, 404, { error: "Giro non trovato" });
      return sendJson(response, 200, route);
    }

    if (routeMatch && method === "DELETE") {
      await deleteRoute(routeMatch[1]);
      return sendJson(response, 200, { ok: true });
    }

    if (method === "POST" && url.pathname === "/api/voice/parse") {
      const body = await parseBody(request);
      const addresses = await listAddresses("");
      return sendJson(response, 200, parseVoiceCommand(body.text || "", addresses));
    }

    if (method === "POST" && url.pathname === "/api/voice/understand") {
      if (!process.env.OPENAI_API_KEY) {
        return sendJson(response, 400, { error: "OPENAI_API_KEY non configurata" });
      }
      const body = await parseBody(request);
      const text = body.text || "";
      const addresses = await listAddresses("");
      const today = new Date().toISOString().slice(0, 10);

      const addressList = addresses.map(a =>
        `id:${a.id} | "${a.customer}${a.location ? " — " + a.location : ""}" | ${a.fullAddress}`
      ).join("\n");

      const systemPrompt = `Sei un assistente per un pianificatore di percorsi di lavoro.
Oggi è ${today}.
L'utente parla in italiano e ti dà un comando vocale trascritto.
Devi interpretarlo e restituire SOLO un oggetto JSON valido (senza markdown, senza commenti).

## Elenco indirizzi disponibili
${addressList}

## Schema JSON di output
{
  "action": "update" | "optimize" | "remove",
  "scheduledDate": "YYYY-MM-DD" | "",
  "startTime": "HH:MM" | "",
  "firstArrivalTime": "HH:MM" | "",
  "arrivalLeadMinutes": number | null,
  "start": { "label": string, "address": string } | null,
  "end": { "label": string, "address": string } | null,
  "stops": [
    {
      "addressId": number,
      "customer": string,
      "location": string,
      "fullAddress": string,
      "openMorning": string,
      "closeMorning": string,
      "openAfternoon": string,
      "closeAfternoon": string,
      "durationMinutes": number,
      "lat": number | null,
      "lng": number | null,
      "recognized": true
    }
  ],
  "removeStops": [{ "id": number, "customer": string, "location": string }],
  "needsConfirmation": []
}

## Regole
- Per le tappe: cerca nell'elenco sopra il contatto più simile al nome menzionato. Copia tutti i campi (addressId, customer, location, fullAddress, orari, lat, lng) dall'elenco. Se non trovi corrispondenza, metti recognized: false e lascia addressId null.
- "ottimizza", "calcola", "salva e vai" → action: "optimize"
- "rimuovi", "togli", "elimina" → action: "remove" e popola removeStops
- Se dici "domani" calcola la data corretta rispetto a oggi (${today})
- Restituisci SOLO il JSON, nessun testo aggiuntivo.`;

      const oaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: text }
          ]
        })
      });

      if (!oaiRes.ok) {
        const err = await oaiRes.json().catch(() => ({}));
        return sendJson(response, 500, { error: err.error?.message || "Errore OpenAI" });
      }
      const oaiData = await oaiRes.json();
      const parsed = JSON.parse(oaiData.choices[0].message.content);
      parsed.transcript = text;
      return sendJson(response, 200, parsed);
    }

    if (method === "POST" && url.pathname === "/api/voice/transcribe") {
      if (!process.env.OPENAI_API_KEY) {
        return sendJson(response, 400, { error: "OPENAI_API_KEY non configurata" });
      }
      const chunks = [];
      await new Promise((resolve, reject) => {
        request.on("data", chunk => chunks.push(chunk));
        request.on("end", resolve);
        request.on("error", reject);
      });
      const audioBuffer = Buffer.concat(chunks);
      if (!audioBuffer.length) return sendJson(response, 400, { error: "Audio vuoto" });
      const contentType = request.headers["content-type"] || "audio/webm";
      const form = new FormData();
      form.append("file", new Blob([audioBuffer], { type: contentType }), "audio.webm");
      form.append("model", "whisper-1");
      form.append("language", "it");
      const oaiRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        body: form
      });
      if (!oaiRes.ok) {
        const err = await oaiRes.json().catch(() => ({}));
        return sendJson(response, 500, { error: err.error?.message || "Errore Whisper" });
      }
      const data = await oaiRes.json();
      return sendJson(response, 200, { text: data.text || "" });
    }

    return sendJson(response, 404, { error: "Endpoint non trovato" });
  } catch (error) {
    console.error(error);
    return sendJson(response, 500, { error: error.message || "Errore server" });
  }
}

const server = http.createServer((request, response) => {
  if (request.url?.startsWith("/api/")) {
    handleApi(request, response);
    return;
  }
  serveStatic(request, response);
});

server.listen(PORT, HOST, () => {
  console.log(`Work Route Planner attivo su http://${HOST}:${PORT}`);
});
