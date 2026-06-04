# ROADMAP

## Fase 0 - Ordine progetto

Stato: in corso.

- Creare `PROJECT.md`.
- Creare `VISIONE_PROGETTO.md`.
- Creare `ROADMAP.md`.
- Creare `DECISIONI.md`.
- Stabilire che Codex aggiorna questi file dopo modifiche importanti.
- Riallineare una cartella Git vera con GitHub.

## Fase 1 - Rubrica clienti evoluta

Priorita: alta.

Obiettivo: trovare una tappa anche se l'utente ricorda il nome del locale o dell'attivita, non solo il cliente.

Attivita:

- Fatto 2026-06-02: fix stabile `v22`: la normalizzazione delle risposte API e stata spostata dentro `public/app.js`. Indirizzi, giri salvati, meteo, riepilogo e risultato percorso vengono convertiti in strutture sicure prima del render, evitando crash tipo `state.addresses.map is not a function`.
- Nota 2026-06-02: `address-response-guard.js` e stato un tentativo precedente e non deve essere ricaricato dall'HTML; la difesa corretta ora vive in `app.js`.
- Fatto 2026-06-02: aggiunto filtro archivio compatibile con l'attuale `app.js`, con lista chiusa di default, filtro cliente/sede e filtro citta. Il modulo `archive-filter-lite.js` non intercetta piu gli eventi dell'app e nasconde realmente le card visibili.
- Fatto 2026-06-02: aggiunto `contact-actions-lite.js` per telefono/email in modo compatibile con lo schema attuale. I dati vengono salvati nelle note come `Tel:`/`Email:` e mostrati con pulsanti `Chiama`/`Email` nella scheda contatto.
- Fatto 2026-06-02: aggiunto `route-stop-contact-lite.js` per mostrare `Naviga`, `Chiama` e `Email precompilata` nelle tappe del giro calcolato o aperto dai giri salvati. L'email usa data giro, orario di arrivo e nome tappa.
- Da completare: migrazione database nativa per campi `phone` ed `email`, cosi i contatti non dipendono piu dalle note.
- Aggiungere campi rubrica: `businessName`, `aliases`, `phone`, `email`, `favorite`, `lastUsedAt`.
- Aggiornare database SQLite/Postgres con migrazione.
- Aggiornare form archivio clienti.
- Aggiornare ricerca archivio.
- Aggiornare import Excel/clienti.
- Migliorare import contatti da `.vcf`, `.vcard` e `.csv`.
- Aggiungere creazione manuale veloce cliente da telefono.
- Aggiungere preferiti e recenti.

## Fase 2 - Ricerca vocale intelligente

Priorita: alta.

Obiettivo: dire solo il nome cliente, attivita o locale e ottenere la tappa corretta.

Attivita:

- Migliorare `server/voiceParser.js`.
- Cercare in cliente, attivita, sede, alias, note e indirizzo.
- Calcolare punteggio di corrispondenza.
- Se una corrispondenza e forte, aggiungere direttamente.
- Se ci sono piu candidati, mostrare una scelta.
- Se non c'e corrispondenza, aprire creazione nuovo cliente.

## Fase 3 - Nuovo design mobile-first

Priorita: media-alta.

Obiettivo: avvicinare l'app al modello visivo allegato.

Schermate:

- Home/Dashboard.
- Inserimento vocale.
- Archivio clienti.
- Percorso ottimizzato.
- Storico lavori.

Attivita:

- Ridisegnare navigazione inferiore con icone.
- Aggiungere dashboard con riepilogo giorno.
- Rendere il microfono un'azione primaria.
- Riorganizzare archivio in clienti, preferiti, recenti.
- Migliorare pagina percorso con mappa, tappe e navigazione.

## Fase 4 - Percorso e navigazione

Priorita: media.

Obiettivo: percorso piu vicino a Maps, senza perdere ottimizzazione e costi.

Attivita:

- Fatto 2026-06-02: disattivata la mappa interattiva interna nel risultato percorso, per evitare percorsi visivi incoerenti.
- Fatto 2026-06-02: aggiunta preferenza navigatore `Google Maps`/`Mappe Apple`, salvata nel browser e modificabile dal risultato e dalle impostazioni.
- Fatto 2026-06-02: sostituiti i doppi pulsanti Google/Mappe con un solo pulsante `Naviga` per ogni tappa e `Apri percorso` per il giro completo.
- Fatto 2026-06-03: eliminato il blocco su `Calcolo...` e `Carico giro e meteo` con fallback locale distanze, matrice tratte parallela, refresh meteo automatico con timeout e fallback per tappa.
- Fatto 2026-06-03: corretto `addressQuery()` per usare l'indirizzo completo quando non ci sono campi strutturati; prima trasformava molti indirizzi in sola `Italia`, producendo distanze da 0,2 km.
- Continuare a migliorare formato indirizzi per MapQuest.
- Valutare integrazione Google Maps solo se MapQuest resta impreciso.
- Salvare ordine manuale quando l'utente lo modifica.

## Fase 5 - Storico e gestione giri

Priorita: media.

Attivita:

- Fatto 2026-06-02: rinomina/elimina giri salvati sono gia presenti nell'app principale; disattivato `route-management-lite.js` per evitare pulsanti duplicati.
- Nota 2026-06-02: `saved-route-guard.js` e `saved-route-open-lite.js` sono stati tentativi precedenti e non devono essere caricati dall'HTML. Il render robusto dei giri salvati ora passa da `normalizeRouteResult()` in `app.js`.
- Eliminare giri salvati.
- Rinominare giri salvati.
- Filtrare per data, cliente, completato/annullato.
- Salvare meteo storico reale per giri passati.

## Fase 6 - Qualita dati

Priorita: continua.

Attivita:

- Pulire import Excel.
- Separare bene cliente, attivita, sede e indirizzo.
- Evitare duplicati.
- Aggiungere correzione guidata degli indirizzi.

## Fase 7 - Eventuale app iOS nativa

Priorita: futura.

Obiettivo: accedere alla rubrica iPhone con consenso nativo, se la sola importazione file non basta.

Attivita:

- Valutare wrapper Capacitor o app iOS dedicata.
- Richiedere permesso Contatti in modo nativo.
- Permettere scelta contatti dalla rubrica iPhone.
- Sincronizzare i contatti scelti con l'archivio clienti dell'app.

## Fase 8 - Menu impostazioni e guida

Priorita: prossima.

Obiettivo: sostituire la scheda separata `Impostazioni tariffe` con un menu a tendina/impostazioni generale.

Attivita:

- Creare un pulsante menu impostazioni nell'header.
- Spostare tariffe giornata dentro il menu.
- Spostare preferenza navigatore dentro il menu.
- Aggiungere sezione guida rapida: come creare un giro, usare archivio, aprire navigazione, modificare tariffe.
- Valutare se rimuovere la tab `Impostazioni tariffe` dalla barra inferiore dopo il nuovo menu.
