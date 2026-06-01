# Percorsi lavoro

Web app per pianificare giornate lavorative con piu tappe, archivio indirizzi, orari di apertura, tempi di intervento, distanze, tempi guida, meteo e costo finale.

## Avvio locale

```bash
cp .env.example .env
node server/index.js
```

Apri:

```text
http://localhost:5174
```

## Funzioni principali

- Nuovo percorso con data del giro.
- Archivio indirizzi con cliente, sede, indirizzo, note, orari e durata abituale.
- Ottimizzazione ordine tappe.
- Calcolo km, guida, lavoro e costi.
- Giri salvati.
- Meteo per ogni tappa.
- PWA installabile su iPhone.
- Tema automatico giorno/notte bianco/nero/turchese.

## API opzionali

```bash
MAPQUEST_API_KEY=
OPENROUTESERVICE_API_KEY=
OPENWEATHER_API_KEY=
WEATHERBIT_API_KEY=
```

Senza API mappe l'app usa stime locali. Senza API meteo usa Open-Meteo come fallback.

## File sensibili

Non salvare `.env` su GitHub. Il file `.gitignore` lo esclude gia.
