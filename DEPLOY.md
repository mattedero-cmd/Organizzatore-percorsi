# Pubblicazione fuori casa

Per usare l'app da iPhone fuori dalla rete di casa serve un indirizzo pubblico HTTPS. La soluzione consigliata e un piccolo VPS con Docker e Caddy: l'app resta tua, il database SQLite viene salvato su volume persistente, Caddy gestisce automaticamente il certificato HTTPS.

La versione Vercel usa invece Postgres collegato al progetto e legge le variabili ambiente dal pannello Vercel.

## Vercel

Nel progetto `organizzatore-percorsi`, aggiungi queste variabili in `Settings -> Environment Variables` per gli ambienti Production e Preview:

```text
MAPQUEST_API_KEY
OPENWEATHER_API_KEY
WEATHERBIT_API_KEY
```

Dopo ogni modifica alle variabili, avvia un nuovo deploy. Vercel applica le chiavi solo ai deploy creati dopo il salvataggio.

## Requisiti VPS

- Un dominio o sottodominio, per esempio `percorsi.tuodominio.it`.
- Un VPS Linux con Docker e Docker Compose.
- Le porte `80` e `443` aperte sul firewall del VPS.

## 1. Punta il dominio al VPS

Nel DNS del dominio crea un record `A`:

```text
percorsi.tuodominio.it -> IP_DEL_VPS
```

## 2. Carica il progetto sul VPS

Dal Mac, dentro la cartella del progetto:

```bash
rsync -av --exclude data --exclude .env ./ utente@IP_DEL_VPS:/opt/percorsi-lavoro/
```

Oppure caricalo con Git.

## 3. Crea il file `.env` sul VPS

```bash
cd /opt/percorsi-lavoro
nano .env
```

Esempio:

```bash
APP_DOMAIN=percorsi.tuodominio.it
ACME_EMAIL=nome@tuodominio.it
MAPQUEST_API_KEY=
OPENROUTESERVICE_API_KEY=
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini
OPENWEATHER_API_KEY=
WEATHERBIT_API_KEY=
FALLBACK_AVERAGE_SPEED_KMH=52
FALLBACK_ROAD_FACTOR=1.22
```

## 4. Avvia

```bash
docker compose up -d --build
```

Apri:

```text
https://percorsi.tuodominio.it
```

## Installazione su iPhone

Da Safari apri il dominio HTTPS, poi:

```text
Condividi -> Aggiungi alla schermata Home
```

## Backup database

```bash
docker compose exec app sqlite3 /data/work-routes.sqlite ".backup '/data/backup-work-routes.sqlite'"
docker compose ps
```

Poi copia il file dal container indicato da `docker compose ps`.
