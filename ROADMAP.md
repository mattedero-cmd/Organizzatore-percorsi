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

- Aggiungere campi rubrica: `businessName`, `aliases`, `phone`, `email`, `favorite`, `lastUsedAt`.
- Aggiornare database SQLite/Postgres con migrazione.
- Aggiornare form archivio clienti.
- Aggiornare ricerca archivio.
- Aggiornare import Excel/clienti.
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

- Continuare a migliorare formato indirizzi per MapQuest.
- Valutare integrazione Google Maps solo se MapQuest resta impreciso.
- Aggiungere pulsante naviga per ogni tappa.
- Aggiungere pulsante naviga percorso completo.
- Salvare ordine manuale quando l'utente lo modifica.

## Fase 5 - Storico e gestione giri

Priorita: media.

Attivita:

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
