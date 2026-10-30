# Investigation: Bordi residui nella locandina ALTROCHE

## Hand-off Brief

1. **Confirmed:** il ritaglio mostrato contiene una fascia bordeaux destra e un residuo superiore, ma perde anche contenuto a sinistra e la riga informativa inferiore.
2. **Status:** confronto diretto con l'originale eseguito; rettangolo corretto verificato visivamente in un'anteprima temporanea, senza modificare la bozza.
3. **Next:** correggere la localizzazione dei quattro lati sull'originale, non soltanto rifilare il risultato gia incompleto.

## Case Info

| Field | Value |
| --- | --- |
| Date opened | 2026-10-30 |
| Status | Concluded, correzione implementata e geometria verificata sull'immagine reale |
| System | macOS, Next.js locale, browser integrato |
| Evidence sources | Bozza reale /crea, blob originale e ritagliato, analisi canvas, lib/poster-crop.ts |

## Problem Statement

L'utente segnala un bordo superiore e uno destro nel ritaglio dichiarato completato. Verificare come isolare la locandina senza eliminare il suo contenuto.

## Evidence Inventory

| Source | Status | Notes |
| --- | --- | --- |
| Screenshot originale | Available | 576x1280, storia Facebook con intestazione del post distinta dal foglio |
| Ritaglio attuale | Available | 473x600, bordo bordeaux e parti del foglio mancanti |
| CSS dell'immagine | Available | padding 0px, bordo 0px |
| Anteprima di controllo | Available | Canvas dall'originale: left75, top388, width424, height608 |
| Risposta AI/box applicato/metodo | Missing | Non rieseguire inferenza solo per recuperare una risposta diversa |

## Confirmed Findings

- Il difetto e presente nel bitmap, non e un bordo CSS dell'anteprima.
- Nell'originale il foglio e circa x76..499, y388..996. L'anteprima di controllo conserva i loghi superiori, tutto il testo laterale e la riga INFO/ENTRATA LIBERA in basso.
- Il ritaglio attuale non puo essere corretto completamente con un ulteriore taglio: il contenuto sinistro e inferiore deve essere recuperato dall'originale.
- `lib/poster-crop.ts`, `trimScreenshotBands`: la rimozione delle fasce richiede colore quasi neutro e uniformita almeno 0.995; una fascia bordeaux sfumata non soddisfa questi criteri.

## Hypothesized Paths

### Hypothesis 1: Bordi aggiunti dal layout

**Status:** Refuted. L'immagine ha bordo e padding nulli; le fasce restano nel confronto isolato del blob.

### Hypothesis 2: Rettangolo di localizzazione spostato/incompleto

**Status:** Confirmed per il risultato visivo. Il ritaglio include lo sfondo destro ma esclude parte del foglio sinistro e inferiore.

**Missing:** non e ancora determinato quale tentativo AI, profilo appreso o snapping abbia prodotto quel rettangolo.

### Hypothesis 3: Il rifilo locale non riconosce sfondi colorati

**Status:** Deduced dal codice e dal bitmap. Confermare con una regressione pixel che eserciti l'intero percorso con sfondo bordeaux sfumato e box errato equivalente.

## Recommended Next Steps

- Usare l'originale per individuare il rettangolo del foglio, escludendo intestazione del post e sfondo della storia su tutti i lati.
- Correggere insieme posizione e dimensioni; non allargare indiscriminatamente il box AI e non rimuovere percentuali fisse dai bordi.
- Conservare la grafica interna e verificare la completezza, non soltanto l'assenza di controlli social.
- Testare sfondo colorato/sfumato e testo vicino ai quattro lati, oltre ai casi gia coperti. Le coordinate rilevate sono un riferimento del solo campione, non una regola da codificare.

## Conclusion

**Confidence:** High sul difetto e sulla geometria corretta di questo campione; Medium sulla causa interna fino alla riproduzione deterministica del percorso applicato.

Nessuna modifica al codice di produzione o alla bozza, nessuna pubblicazione o richiesta AI durante questa diagnosi. L'anteprima temporanea viene rimossa dopo il controllo.

## Follow-up: 2026-10-30

### Implementazione Approvata

L'utente ha approvato la correzione automatica. `lib/poster-crop.ts` ora riallinea il rettangolo prima dell'estrazione dai pixel originali, sia per selezioni AI sia per profili appresi. Il controllo si attiva soltanto nel percorso screenshot e richiede lati lunghi ad alto contrasto, foglio chiaro riconoscibile e sovrapposizione sufficiente con la regione iniziale. I risultati locali non sono classificati come `strong`: nessun nuovo bypass della verifica finale.

Il foglio viene distinto dallo sfondo della storia sui quattro lati, separando l'intestazione social. Footer grigi e grandi foto interne sono preservati. La revisione ha individuato anche il caso di un footer completamente scuro: ora la continuita dei due bordi laterali evita di scambiarlo per sfondo esterno.

### Verifiche

- Regressioni rosso/verde in `lib/poster-crop.test.mjs`: due rettangoli AI osservati dal vivo, profili appresi, marcatori laterali e inferiori, footer grigio e footer scuro.
- `node --experimental-strip-types --test lib/poster-crop.test.mjs lib/event-media.test.mjs`: 62 test passati.
- `npx eslint lib/poster-crop.ts lib/poster-crop.test.mjs` e `npx tsc --noEmit`: passati.
- Prova reale via `/api/crop-image`: ottenuto HTTP200, metodo AI, 423x605, box normalizzato `0.13194,0.30391,0.73438,0.47266`. Bitmap completo controllato visivamente: nessuna fascia bordeaux, loghi/testo/contatti presenti.
- Dopo l'ultima protezione dei footer scuri, controllo deterministico sui pixel originali con entrambe le selezioni errate: stesso box rilevato `0.130864,0.303333,0.735802,0.473333`, prima degli arrotondamenti ai pixel.
- Tre bozze aperte aggiornate attraverso i controlli di modifica esistenti, riutilizzando i byte del risultato verificato. Nessuna pubblicazione. Dimensioni finali confermate 423x605 per tutte; nessun editor lasciato aperto.

### Limiti Residui

Le risposte AI non sono deterministiche: osservati anche HTTP204 `verification-rejected` e una selezione AI errata approvata prima dell'ultimo riallineamento. Un'ulteriore scansione finale e stata rifiutata; il controllo geometrico isolato sulla stessa versione finale conferma la correttezza dei bordi per le due selezioni riprodotte, non una garanzia per ogni possibile risposta AI. La verifica non viene aggirata o indebolita. Le bozze mantengono il risultato corretto gia verificato.

Nessun segreto modificato, nessun deploy o commit eseguito dall'assistente. I servizi diagnostici temporanei in memoria sulla porta3021 sono terminati e le anteprime sovrapposte sono state rimosse; nessuna immagine reale e stata aggiunta al repository.