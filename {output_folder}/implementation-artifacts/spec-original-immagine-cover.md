---
title: 'Conservare l’immagine originale della copertina'
type: 'feature'
created: '2026-11-09'
status: 'done'
baseline_commit: '93cc7011b2144ed8cb5cea6cd7ce8b57c3ddeacb'
route: 'plan-code-review'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Quando si crea un evento da una locandina, il crop automatico può diventare la sola immagine salvata. Nell’editor, riaprire il ritaglio mostra quindi l’immagine già ritagliata invece della locandina originale.

**Approach:** Conservare per ogni evento sia la sorgente originale caricata sia la copertina attualmente usata, insieme alle coordinate normalizzate del ritaglio. L’editor riapre la sorgente originale con il riquadro del ritaglio corrente; la copertina pubblica resta invariata finché il ritaglio non viene applicato e salvato.

## Boundaries & Constraints

**Always:** Salvare e riutilizzare i file tramite Supabase Storage; mantenere compatibili gli eventi esistenti senza sorgente originale; aggiornare la sorgente solo quando viene scelta una nuova immagine; persistere il crop in coordinate normalizzate rispetto alla sorgente; l’originale serve all’editor e non diventa un allegato visibile nella galleria evento.

**Ask First:** Nessuno spostamento o rimozione dei file già archiviati.

**Never:** Non sostituire la copertina mostrata con l’originale; non usare un ritaglio salvato come sorgente per un nuovo crop quando è disponibile l’originale.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|----------------------------|----------------|
| Creazione da locandina | File originale e crop automatico | Entrambi vengono salvati; il crop resta copertina e l’originale resta sorgente per l’editor | Se l’upload della sorgente fallisce, segnalare l’errore senza dichiarare il salvataggio completo |
| Riapertura crop | Evento con sorgente e coordinate salvate | L’editor mostra la sorgente originale sotto il riquadro nella posizione salvata | Eventi legacy senza sorgente aprono la copertina attuale |
| Nuovo crop/sostituzione | Crop applicato o nuovo file selezionato | Aggiornare copertina, sorgente e coordinate coerentemente | Un errore mantiene intatte le immagini già salvate |
| Evento senza crop | Sola immagine scelta | La stessa immagine resta copertina e sorgente, con crop predefinito | Nessuna regressione nel salvataggio JSON legacy |

</frozen-after-approval>

## Code Map

- `app/crea/page.tsx`, `app/components/ImageUploader.tsx` -- mantenere la sorgente originale nella bozza e inviarla al salvataggio.
- `lib/poster-sections.ts`, `app/api/poster-sections/route.ts`, `lib/draft-image-crop.ts` -- riportare le coordinate della sezione evento sulla sorgente originale, anche quando la sezione è estratta da un ritaglio automatico intermedio.
- `app/api/events/route.ts`, `app/api/events/[id]/route.ts` -- caricare sorgente e copertina e persistere il crop.
- `prisma/schema.prisma`, `prisma/migrations/` -- aggiungere campi nullable per URL sorgente e coordinate crop.
- `app/events/[slug]/edit/page.tsx`, `app/components/EventImageCropper.tsx` -- inizializzare il cropper con sorgente e crop salvati.
- `app/types/event.ts` -- estendere i tipi dell’evento.

## Tasks & Acceptance

**Execution:**
- [x] `app/components/ImageUploader.tsx`, `app/crea/page.tsx` -- trattenere il file originale caricato e inviarlo insieme alla cover ritagliata, senza perdere la gestione delle bozze e delle locandine multiple.
- [x] `prisma/schema.prisma`, `prisma/migrations/`, `app/api/events/route.ts`, `app/api/events/[id]/route.ts`, `app/types/event.ts` -- salvare URL originale e rettangolo normalizzato; mantenere compatibilità con eventi esistenti e aggiornamenti senza nuova immagine.
- [x] `app/events/[slug]/edit/page.tsx`, `app/components/EventImageCropper.tsx` -- aprire la sorgente originale con selezione iniziale salvata e aggiornare sorgente/crop solo al salvataggio riuscito.
- [x] Test mirati -- verificare persistenza, fallback legacy e ripristino delle coordinate di crop.
- [x] Sezioni di locandine multiple -- salvare coordinate composte rispetto all’originale, non quelle del ritaglio intermedio.

**Acceptance Criteria:**
- Given un evento creato da un’immagine ritagliata automaticamente, when viene salvato, then sorgente originale, copertina usata e crop sono persistiti distintamente.
- Given un evento con crop salvato, when si apre “Ritaglia immagine”, then sotto il riquadro è visibile l’originale e il riquadro coincide con il crop corrente.
- Given un evento legacy senza sorgente salvata, when si apre il cropper, then continua a essere possibile ritagliare la copertina esistente.
- Given un errore nel caricamento o aggiornamento, when si salva un nuovo crop, then i riferimenti precedenti restano utilizzabili e l’errore è visibile.
- Given una locandina con più eventi, when una sezione rilevata sostituisce la copertina, then il crop riaperto è riferito alla stessa sezione dell’immagine originale.

## Spec Change Log

## Design Notes

URL sorgente e coordinate crop sono metadati della copertina, non `EventMedia`: in questo modo l’originale rimane disponibile per l’editing senza comparire nella galleria pubblica.

## Verification

**Commands:**
- `npx prisma generate` -- expected: client aggiornato con i nuovi campi.
- `npx tsc --noEmit --incremental false` -- expected: nessun errore TypeScript.
- `npx eslint app/crea app/components/ImageUploader.tsx app/components/EventImageCropper.tsx app/events/[slug]/edit app/api/events` -- expected: nessun errore lint.
- Test mirati per API e crop -- expected: persistenza, fallback e coordinate verificati.

## Suggested Review Order

**Riapertura del ritaglio**

- L’editor sceglie la sorgente originale prima della copertina di fallback.
  [`edit/page.tsx:225`](../../app/events/[slug]/edit/page.tsx#L225)

- La selezione normalizzata viene ripristinata nel cropper.
  [`edit/page.tsx:683`](../../app/events/[slug]/edit/page.tsx#L683)

- La bozza separa sorgente, copertina attiva e crop applicato.
  [`EventDisplay.tsx:145`](../../app/components/EventDisplay.tsx#L145)

**Persistenza e compatibilità**

- La creazione carica l’originale e salva URL e coordinate del crop.
  [`events/route.ts:168`](../../app/api/events/route.ts#L168)

- L’aggiornamento mantiene i riferimenti esistenti finché il nuovo salvataggio riesce.
  [`events/[id]/route.ts:138`](../../app/api/events/[id]/route.ts#L138)

- Il file sorgente viene caricato senza trasformazioni.
  [`supabase.ts:149`](../../app/lib/supabase.ts#L149)

- Le colonne nullable supportano gli eventi già esistenti.
  [`schema.prisma:24`](../../prisma/schema.prisma#L24)

- La migration aggiunge URL e coordinate senza rimuovere dati.
  [`migration.sql:2`](../../prisma/migrations/20261109170000_store_original_event_cover/migration.sql#L2)

**Sezioni di locandine multiple**

- Il bounding box della sezione viene composto col crop automatico originale.
  [`crea/page.tsx:367`](../../app/crea/page.tsx#L367)

- L’API restituisce coordinate normalizzate della sezione rilevata.
  [`poster-sections/route.ts:43`](../../app/api/poster-sections/route.ts#L43)

- Il rettangolo OCR è normalizzato rispetto all’immagine sorgente.
  [`poster-sections.ts:151`](../../lib/poster-sections.ts#L151)

- La composizione annidata mantiene il riferimento all’originale.
  [`draft-image-crop.ts:21`](../../lib/draft-image-crop.ts#L21)

**Privacy delle risposte**

- Le risposte evento non autorizzate redigono sorgente e crop.
  [`events/[id]/route.ts:220`](../../app/api/events/[id]/route.ts#L220)

- Liste pubbliche e preferiti non espongono i metadati originali.
  [`event-media.ts:16`](../../lib/event-media.ts#L16)

**Test**

- I test coprono redazione e composizione delle coordinate.
  [`event-media.test.mjs:41`](../../lib/event-media.test.mjs#L41)

- Il bounding box OCR viene verificato in coordinate normalizzate.
  [`poster-sections.test.mjs:35`](../../lib/poster-sections.test.mjs#L35)
