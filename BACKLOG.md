# Backlog — Organizzatore Percorsi

Elenco dei punti del piano di stabilizzazione non ancora completati, in ordine di priorità.

## Da fare

1. **Pannello admin ampliato** — aggiungere sezioni: log errori server, log chiamate API esterne (Google/OpenAI), rilevamento giri duplicati, statistiche complete per utente.
2. **Header migliorato** — rivedere topbar (stato connessione, accesso rapido al menu, indicatore sincronizzazione).
3. **Condivisione giri server-side** — il routing `/share/:token` è pronto (SPA fallback su Node e Vercel), ma manca l'endpoint API che genera/risolve i token di condivisione e la UI relativa.
4. **Soste vs interventi brevi** — le soste non cadono mai dentro una tappa (inserite solo tra tappe o in guida); valutare la regola esplicita "sposta prima/dopo" per interventi < 3h se emergono casi reali.
5. **Statistiche: filtro duplicati storici** — i nuovi duplicati sono prevenuti a monte (dedup client+server); per i dati storici valutare uno script di pulizia una tantum.

## Fatto (riferimento)

- Link condivisi 404 (vercel.json + server Node)
- Elemento fantasma toast
- Naming automatico giri "GG/MM/AAAA – Prima tappa"
- Debounce ricerca archivio + dedup/caching chiamate `/api/addresses`
- Crash eliminazione contatto (try/catch + verifica giri non rotti)
- Giri duplicati (guard client + dedup server 10s)
- Overflow orari card archivio (ellipsis)
- Multi-tenancy verificata con due utenti reali
- Bug `last_insert_rowid()` cross-processo (id 0/null su saveRoute, createAddress, createUser)
- Errori di validazione planner come 400
- Toggle calcolo costi per giro (default off)
- Palette "Aziendali" con due colori personalizzabili (primario + secondario)
- Guida in-app aggiornata
- Integrazione Meteo Trentino (bollettino ufficiale per tappe in Trentino, fallback Open-Meteo)
- Tema aziendale bicolore + ranking pertinenza ricerca archivio
