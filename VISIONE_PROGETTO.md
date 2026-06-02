# VISIONE PROGETTO

## Visione

L'app deve diventare un assistente pratico per tecnici e installatori che fanno piu interventi nella stessa giornata.

L'utente deve poter dire o scrivere poche parole, ad esempio:

```text
Aggiungi Bar Centrale Rovereto
Aggiungi Rossi Mario
Aggiungi Banca Intesa Trento
Domani parto da casa e voglio essere alla prima tappa 10 minuti prima dell'apertura
```

L'app deve riconoscere il cliente anche se l'utente ricorda solo:

- nome cliente;
- nome attivita;
- nome locale;
- sede/comune;
- indirizzo;
- alias o parole nelle note.

## Inserimento vocale desiderato

Il flusso ideale e:

1. L'utente preme il pulsante microfono.
2. Dice una frase naturale.
3. L'app cerca nella rubrica clienti usando cliente, attivita, sede, alias, note e indirizzo.
4. Se trova una corrispondenza buona, aggiunge la tappa.
5. Se trova piu possibili clienti, mostra una scelta rapida.
6. Se non trova nulla, propone di creare un nuovo cliente.
7. L'utente conferma o corregge.

## Struttura rubrica desiderata

Ogni voce rubrica deve avere:

- nome cliente;
- nome attivita o locale;
- sede/comune;
- indirizzo completo;
- via e numero;
- CAP;
- provincia;
- nazione;
- alias/parole chiave;
- note;
- telefono opzionale;
- email opzionale;
- orari mattina;
- orari pomeriggio;
- durata abituale intervento;
- coordinate, se note;
- data ultimo utilizzo;
- preferito si/no.

## Esperienza utente desiderata

Stile mobile-first, vicino all'immagine allegata dall'utente:

- dashboard iniziale con lavori del giorno, km totali e prossimo appuntamento;
- grande pulsante centrale per inserimento vocale;
- archivio clienti con ricerca rapida, preferiti e recenti;
- percorso ottimizzato con mappa vera, tappe numerate e pulsanti di navigazione;
- storico lavori con giri completati, annullati e passati;
- palette blu/turchese, bianco e nero, con tema chiaro/scuro;
- icone semplici e leggibili;
- schermate meno dense, piu guidate.

## Problemi aperti

- La rubrica attuale non distingue ancora bene cliente, attivita/locale e alias.
- Il parser vocale attuale cerca soprattutto `cliente + sede`.
- Serve una ricerca fuzzy piu robusta.
- Serve gestione dei casi ambigui: piu clienti simili.
- Serve sincronizzare stabilmente il progetto su GitHub.
- L'import Excel e utile ma va pulito con attenzione per fogli con colonne spostate.
