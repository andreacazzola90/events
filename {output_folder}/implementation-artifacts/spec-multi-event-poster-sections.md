---
title: 'Immagini per eventi di rassegna e ritaglio sezione da locandina multi-evento'
type: 'feature'
created: '2026-11-02'
status: 'done'
baseline_commit: '4231bd765edc64e60a4772746afb9e946ddc6f0a'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** La pagina `/rassegne/[slug]` non mostra immagini degli eventi; inoltre, quando una locandina contiene più eventi, ogni evento salva come copertina la stessa locandina intera, senza distinguere il proprio dettaglio.

**Approach:** Mostrare la copertina di ogni evento nella pagina rassegna. Per locandine con più eventi, individuare via OCR (Tesseract, righe data/titolo con bounding box) la sezione del singolo evento, usarla come copertina e salvare la locandina completa come immagine aggiuntiva (`EventMedia`), così ogni evento ha immagine di dettaglio + immagine completa. Il modello vision è escluso: il probe ha restituito riquadri inventati.

## Boundaries & Constraints

**Always:** Fallback sicuro: se l’OCR non trova l’evento con confidenza sufficiente, la copertina resta la locandina intera e nessun errore blocca la pubblicazione. La copertina di sezione è letterboxata a 16:9 con il colore di sfondo campionato, senza deformare. `originalImageUrl` resta la locandina completa per il ritaglio manuale. Upload della locandina completa validato con `validateEventMediaFile` e conteggiato nel limite `MAX_EVENT_ATTACHMENTS`. Lavoro OCR solo server-side, con timeout e `cachePath` in `os.tmpdir()`.

**Ask First:** Nessuno (backfill `--apply` approvato dall'utente il 2026-11-02).

**Never:** Usare il vision AI per i riquadri; bloccare il flusso singolo-evento; cancellare o spostare immagini esistenti; nuove dipendenze o migrazioni DB.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Locandina lista eventi | 5 eventi, titoli leggibili | 5 copertine distinte (data+titolo+sottotitolo), locandina completa in galleria | N/A |
| Evento non trovato | Titolo non presente nel testo OCR | Copertina = locandina intera; nessun media duplicato | Log warning |
| OCR fallito/timeout | Errore Tesseract | Tutte le bozze mantengono la locandina | Endpoint risponde 200 con `sections: []` |
| Ultimo evento | Nessun anchor successivo | Sezione termina al primo salto verticale > 1,8× altezza riga mediana o a fine immagine | N/A |
| Eventi affiancati | Anchor sulla stessa fascia y ma colonne diverse | Il limite inferiore considera solo anchor sovrapposti orizzontalmente | N/A |
| Evento singolo | 1 bozza | Flusso invariato, nessuna chiamata sezioni | N/A |

</frozen-after-approval>

## Code Map

- `lib/poster-sections.ts` (nuovo) -- logica pura: match titolo/data su righe OCR, calcolo box per evento, letterbox 16:9.
- `app/api/poster-sections/route.ts` (nuovo) -- POST immagine+eventi, OCR Tesseract, ritorna data URL JPEG per indice.
- `app/crea/page.tsx` -- dopo il crop locandina (o subito se assente), se >1 bozza chiama l’endpoint; imposta `imageUrl` = sezione, `posterImageUrl` = locandina; invia `posterImage` nel multipart; `imageProcessing` include lo stato sezioni.
- `lib/draft-image-crop.ts` -- `prepareDraftForPublication` rimuove anche `posterImageUrl`.
- `app/api/events/route.ts` -- accetta `posterImage` multipart; dopo la creazione la salva come `EventMedia` (kind image, nome `Locandina completa` senza estensione, usato anche dalla pagina rassegna per riconoscerla; position 0); errori upload media non annullano l’evento.
- `app/rassegne/[slug]/page.tsx` -- seleziona `imageUrl`, miniatura per evento; locandina completa condivisa in header se presente.
- `scripts/backfill-series-event-sections.mjs` (nuovo; `.mjs` come gli altri script Node) -- dry-run di default; `--apply` ritaglia eventi della stessa rassegna con locandina identica (sha256 del file, ogni evento ha una copia caricata a parte) e aggiunge la locandina come media.
- `lib/poster-sections.test.mjs` (nuovo) -- test sulla logica pura con righe OCR fixture.

## Tasks & Acceptance

**Execution:**
- [x] `lib/poster-sections.ts` -- implementare `locateEventSections(lines, events, size)` e `letterboxSection` -- logica testabile e deterministica.
- [x] `lib/poster-sections.test.mjs` -- coprire matrice I/O con le righe OCR reali della locandina «Cinque incontri».
- [x] `app/api/poster-sections/route.ts` -- OCR con timeout 25 s, validazione immagine, risposta `{ sections: [{ index, image }] }`.
- [x] `lib/draft-image-crop.ts`, `app/crea/page.tsx` -- avvio rilevamento sezioni e stato di attesa pubblicazione.
- [x] `app/api/events/route.ts` -- persistenza `posterImage` come `EventMedia`.
- [x] `app/rassegne/[slug]/page.tsx` -- miniature evento e locandina.
- [x] `scripts/backfill-series-event-sections.mjs` -- backfill opzionale (applicato a «Cinque incontri»: 5/5).
- [x] `docs/API_REFERENCE.md` -- documentare `/api/poster-sections` e campo `posterImage`.

**Acceptance Criteria:**
- Given una rassegna con eventi con `imageUrl`, when apro `/rassegne/[slug]`, then ogni evento mostra la sua miniatura.
- Given una locandina multi-evento caricata in `/crea`, when pubblico, then ogni evento ha copertina di sezione e la locandina completa nella galleria «Immagini e documenti».
- Given un evento pubblicato, when lo modifico, then posso aggiungere/rimuovere immagini aggiuntive con l’editor media esistente.

## Design Notes

Anchor = riga titolo con overlap token normalizzati ≥ 0.6 (accenti/punteggiatura rimossi); se la riga immediatamente sopra (entro 2 altezze riga) contiene giorno+mese dell’evento, il top parte da lì. Bottom = top dell’anchor successivo sovrapposto in x, meno 2 px. Larghezza = colonna dominante: parole con confidenza ≥ 80 raggruppate per distanza ≤ 3 altezze riga, si tiene il gruppo più largo (evita loghi a lato). Ultima sezione: si scende finché una riga ha confidenza < 50 o un salto > 1,8 altezze riga (esclude il piè di pagina). Padding x = max(16 px, 4% larghezza), y = 0,5 altezze riga; sezioni ≥ 60% dell’area scartate.

## Verification

**Commands:**
- `node --test lib/poster-sections.test.mjs` -- expected: tutti verdi
- `npx eslint lib/poster-sections.ts app/api/poster-sections app/crea/page.tsx app/api/events/route.ts "app/rassegne/[slug]/page.tsx"` -- expected: nessun errore
- `npx tsc --noEmit` -- expected: nessun nuovo errore

**Manual checks:**
- Script backfill in dry-run sulla rassegna «Cinque incontri»: 5 box plausibili; pagina rassegna nel browser mostra miniature.

## Suggested Review Order

**Localizzazione sezioni (OCR)**

- Entry point: titolo+data su righe OCR → box per evento, logica pura testata.
  [`poster-sections.ts:74`](../../lib/poster-sections.ts#L74)

- Intestazione data condivisa: appartiene all'evento sopra, non duplica il ritaglio.
  [`poster-sections.ts:103`](../../lib/poster-sections.ts#L103)

- Colonne affiancate: solo righe della stessa colonna definiscono larghezza e fondo.
  [`poster-sections.ts:115`](../../lib/poster-sections.ts#L115)

- Abort reale: tesseract.js non rigetta i job terminati, quindi si corre contro il signal.
  [`poster-sections.ts:197`](../../lib/poster-sections.ts#L197)

- Letterbox 16:9 col colore dominante, nessuna distorsione.
  [`poster-sections.ts:151`](../../lib/poster-sections.ts#L151)

- Endpoint: validazione, timeout 25 s, fallback `sections: []`.
  [`route.ts:24`](../../app/api/poster-sections/route.ts#L24)

**Flusso /crea e pubblicazione**

- Dopo il crop privacy, ≥2 bozze: sezione come copertina, locandina conservata.
  [`page.tsx:208`](../../app/crea/page.tsx#L208)

- Rilascio object URL e sblocco pubblicazione su reset/nuova scansione.
  [`page.tsx:78`](../../app/crea/page.tsx#L78)

- Client: chiamata endpoint e allegato `posterImage` nel multipart.
  [`draft-image-crop.ts:32`](../../lib/draft-image-crop.ts#L32)

- Salvataggio multiplo invia la locandina completa.
  [`page.tsx:278`](../../app/crea/page.tsx#L278)

- Pubblicazione singola invia la locandina completa.
  [`EventDisplay.tsx:343`](../../app/components/EventDisplay.tsx#L343)

- Server: locandina come primo `EventMedia`; errori non annullano l'evento.
  [`route.ts:23`](../../app/api/events/route.ts#L23)

**Pagina rassegna**

- Locandina in header: media salvato o copertina comune a tutti.
  [`page.tsx:52`](../../app/rassegne/[slug]/page.tsx#L52)

- Miniatura 16:9 per ogni evento, link al dettaglio.
  [`page.tsx:167`](../../app/rassegne/[slug]/page.tsx#L167)

**Periferiche**

- Backfill: dry-run, validazione, limite allegati, pulizia storage su errore.
  [`backfill-series-event-sections.mjs:28`](../../scripts/backfill-series-event-sections.mjs#L28)

- Test edge case: data condivisa, titoli contenuti, abort.
  [`poster-sections.test.mjs:61`](../../lib/poster-sections.test.mjs#L61)

- Test API: locandina in galleria, file non validi ignorati.
  [`event-media.test.mjs:1035`](../../lib/event-media.test.mjs#L1035)

- Documentazione endpoint e campo `posterImage`.
  [`API_REFERENCE.md:398`](../../docs/API_REFERENCE.md#L398)
