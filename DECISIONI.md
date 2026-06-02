# DECISIONI

## D001 - Conservare memoria di progetto in file

Data: 2026-06-02

Decisione: usare file di progetto permanenti per non dipendere solo dalla memoria della chat.

File:

- `PROJECT.md`
- `VISIONE_PROGETTO.md`
- `ROADMAP.md`
- `DECISIONI.md`

Regola: Codex deve leggerli prima di lavori importanti e aggiornarli dopo modifiche rilevanti.

## D002 - Prima migliorare il formato indirizzi, poi valutare Google Maps

Data: 2026-06-02

Decisione: non sostituire subito MapQuest. Prima correggere formato indirizzi, coordinate e dati rubrica.

Motivo: Google Maps funzionava meglio soprattutto perche riceveva indirizzi piu chiari. Una rubrica strutturata migliora tutti i motori mappe e riduce errori futuri.

## D003 - Rubrica clienti come centro dell'app

Data: 2026-06-02

Decisione: la rubrica deve diventare il cuore dell'app, non solo un archivio indirizzi.

Ogni voce deve poter essere trovata con:

- nome cliente;
- nome attivita/locale;
- sede;
- indirizzo;
- alias;
- note.

## D004 - Inserimento vocale con conferma quando ambiguo

Data: 2026-06-02

Decisione: il comando vocale deve aggiungere automaticamente solo quando la corrispondenza e molto chiara.

Se ci sono piu risultati possibili, l'app deve chiedere conferma invece di scegliere a caso.

## D005 - Design target mobile-first

Data: 2026-06-02

Decisione: il nuovo riferimento visivo e l'immagine allegata dall'utente con 5 schermate:

- Home/Dashboard;
- Inserimento vocale;
- Archivio clienti;
- Percorso ottimizzato;
- Storico lavori.

Il design deve essere semplice, professionale, con icone chiare, forte leggibilita e navigazione da telefono.

## D009 - Chiamate meteo in parallelo, non in sequenza

Data: 2026-06-02

Decisione: `attachWeather` in `server/weatherService.js` deve usare `Promise.all`
per chiamare le API meteo in parallelo per tutte le tappe, non un loop sequenziale.

Motivo: con 3 tappe e timeout di 9s ciascuna, il tempo totale poteva essere 27s.
Vercel (e qualsiasi proxy) chiude le connessioni prima. Con `Promise.all` il tempo
totale e pari alla tappa piu lenta, non alla somma.

Regola: ogni nuova API esterna aggiunta a `attachWeather` deve seguire lo stesso
pattern parallelo. Il timeout per singola chiamata deve restare sotto 5s.

## D007 - Variabili ambiente Vercel con prefisso RouteOrg_

Data: 2026-06-02

Decisione: il database Postgres su Vercel (Prisma Postgres `prisma-postgres-cobalt-globe`) espone le variabili con prefisso `RouteOrg_`:

- `RouteOrg_DATABASE_URL`
- `RouteOrg_POSTGRES_URL`
- `RouteOrg_PRISMA_DATABASE_URL`

Il codice in `server/db.js` nella funzione `postgresUrl()` deve leggere queste variabili oltre ai nomi standard (`DATABASE_URL`, `POSTGRES_URL`, ecc.).

Fix applicato il 2026-06-02 da Claude Code nella PR #1.

## D008 - Regola di handoff tra AI (Codex e Claude Code)

Data: 2026-06-02

Decisione: quando si cambia AI (da Codex a Claude Code o viceversa), l'AI che conclude il turno deve:

1. Aggiornare `PROJECT.md` con stato attuale, fix applicati e note tecniche importanti.
2. Aggiornare `ROADMAP.md` marcando le attivita completate con data e nome AI.
3. Aggiornare `DECISIONI.md` con le nuove decisioni prese.
4. Fare commit e push su `main` (o creare PR se su branch separato).
5. Verificare che Vercel abbia il deploy aggiornato.

Lo scopo e che ogni AI che riprende il lavoro trovi lo stato esatto del progetto senza dipendere dalla memoria della chat precedente.

## D006 - Rubrica iPhone: import file nella PWA, accesso diretto solo con app nativa

Data: 2026-06-02

Decisione: nella web app/PWA l'importazione contatti deve passare da file `.vcf`, `.vcard` o `.csv` scelto dall'utente. La PWA non deve promettere accesso diretto e continuo alla rubrica iPhone.

Motivo: Safari/iPhone non offre a una PWA un accesso affidabile alla rubrica nativa per scegliere/esportare contatti come farebbe un'app iOS. Per avere consenso rubrica e scelta contatti nativa serve una versione app iOS o un wrapper nativo, per esempio Capacitor.

Conseguenza pratica: migliorare l'import file e la creazione manuale veloce nella web app; valutare app iOS solo quando la rubrica nativa diventa prioritaria.

## D007 - Telefono/email contatti in compatibilita con database attuale

Data: 2026-06-02

Decisione: nella versione pubblica attuale telefono ed email vengono aggiunti tramite `contact-actions-lite.js` e salvati anche nelle note come righe `Tel:` ed `Email:`.

Motivo: il database pubblico non espone ancora colonne native `phone` ed `email`. Salvare i dati nelle note permette di usare subito i pulsanti `Chiama` e `Email` senza rischiare una migrazione database urgente in produzione.

Conseguenza pratica: quando si fara la migrazione nativa, importare `Tel:` ed `Email:` dalle note nei nuovi campi e lasciare il modulo lite come fallback o rimuoverlo.

## D008 - Risultato percorso: navigazione esterna come fonte affidabile

Data: 2026-06-02

Decisione: la mappa interattiva interna del risultato percorso viene disattivata. Il pannello risultato deve aprire il percorso nel navigatore scelto dall'utente, Google Maps o Mappe Apple.

Motivo: la mappa interna e MapQuest possono mostrare linee o percorsi incoerenti quando gli indirizzi vengono interpretati male. Per il percorso reale su strada e meglio delegare al navigatore esterno scelto.

Conseguenza pratica: il risultato mostra un pannello `Navigazione percorso` con preferenza navigatore e pulsante `Apri percorso`; ogni tappa dettagliata mostra un solo pulsante `Naviga`, piu eventuali `Chiama` e `Email precompilata`.