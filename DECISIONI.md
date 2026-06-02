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