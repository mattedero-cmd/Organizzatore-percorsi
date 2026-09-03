# Backlog — Organizzatore Percorsi

Elenco dei punti del piano di stabilizzazione non ancora completati, in ordine di priorità.

> Stato verificato sul codice a **v5.108**. Questo file viveva solo sul branch di lavoro
> `claude/inspiring-volta-rmlZz` (fermo a mesi indietro) ed è stato riportato su `main` in v5.108,
> con lo stato dei punti riverificato sul codice attuale.

## Da fare

1. **Pannello admin — completare** (parzialmente fatto): ci sono già le statistiche delle chiamate
   API esterne (`GET /api/admin/api-stats` + `/detail`, `apiStats.js`) e le statistiche/sessioni per
   utente (`adminGetStats`, `adminListUsers`, `adminListSessions`).
   **Mancano**: log degli errori del server e rilevamento giri duplicati dentro il pannello.
2. **Header — rivedere** (parzialmente fatto): la topbar mostra solo lo stato Maps
   ("Google Maps" / "Stima locale") e in v5.098 è stata sistemata sotto la status bar iOS.
   **Manca**: accesso rapido/indicatore di sincronizzazione — da ripensare, perché con
   l'architettura **online-first** (v5.080) l'indicatore "sync" originale non ha più senso.
3. **Soste vs interventi brevi**: le soste non cadono mai dentro una tappa (inserite solo tra tappe
   o "in guida"); valutare la regola esplicita "sposta prima/dopo" per interventi < 3h.
   **Caso reale emerso** (23/07/2026): giro con lunga attesa prima di una tappa a disponibilità
   fissa, in cui conveniva anticipare la tappa successiva già aperta invece di restare fermi →
   vedi anche il punto 4.
4. **Riempire le attese con la tappa successiva** (nuovo, dal caso reale del 23/07/2026): quando
   c'è un'attesa forzata (finestra pranzo non ancora aperta, o tappa con disponibilità che inizia
   più tardi) e la tappa successiva in programma è **già aperta e raggiungibile**, andarci prima
   e spostare pausa/tappa fissa dopo, invece di aspettare a vuoto. Oggi va fatto a mano
   (impostando la finestra oraria sulla tappa e riordinando col drag).
5. **Statistiche: filtro duplicati storici**: i nuovi duplicati sono prevenuti a monte (dedup
   client+server, più i fix di v5.083 e v5.099); per i dati storici valutare uno script di
   pulizia una tantum.
6. **Multi-giorno — giorno della settimana per zona** (da `docs/MULTI_GIORNO.md`): scegliere *quale*
   giorno assegnare a ogni zona in base alle chiusure dei clienti. Marginale.

## Fatto (riferimento)

- **Condivisione giri server-side** — COMPLETATA: `POST /api/routes/:id/share` genera il token,
  `GET /api/share/:token` lo risolve, SPA fallback su `/share/:token`, UI "Condividi" sulle card e
  sul risultato, import lato destinatario (`shareRoute` / `handleShareImport`).
- Link condivisi 404 (vercel.json + server Node)
- Elemento fantasma toast
- Naming automatico giri "GG/MM/AAAA – Prima tappa"
- Debounce ricerca archivio + dedup/caching chiamate `/api/addresses`
- Crash eliminazione contatto (try/catch + verifica giri non rotti)
- Giri duplicati (guard client + dedup server 10s) — e in v5.083/v5.099 gli ultimi casi residui
- Overflow orari card archivio (ellipsis)
- Multi-tenancy verificata con due utenti reali
- Bug `last_insert_rowid()` cross-processo (id 0/null su saveRoute, createAddress, createUser)
- Errori di validazione planner come 400
- Toggle calcolo costi per giro (default off)
- Palette "Aziendali" con due colori personalizzabili (primario + secondario)
- Guida in-app aggiornata
- Integrazione Meteo Trentino (bollettino ufficiale per tappe in Trentino, fallback Open-Meteo)
- Tema aziendale bicolore + ranking pertinenza ricerca archivio
- **Multi-giorno**: motore per-zona, unione parziale sul corridoio, dissoluzione delle mezze
  giornate, oracolo allineato al motore reale, drag tappe tra giornate, "Crea i giri" in cartella
  dedicata (v5.070 → v5.107) — vedi `docs/MULTI_GIORNO.md`
- **Pausa pranzo**: regole prima/dopo/spezzata/nell'attesa, locale scelto a mano, mai forzata fuori
  giornata, tragitto al ristorante valutato (v5.09x → v5.105)
