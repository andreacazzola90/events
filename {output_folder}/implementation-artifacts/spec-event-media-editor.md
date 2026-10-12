---
title: 'Editor media per eventi'
type: 'feature'
created: '2026-10-12'
status: 'in-review'
baseline_commit: '4a8147fa10d1d3d12333c53d39b479a3dc38ebd1'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Nell’editor evento la copertina può essere sostituita senza anteprima di crop/zoom; non è possibile aggiungere più immagini o PDF da conservare e mostrare nella pagina evento.

**Approach:** Estendere editor e pagina pubblica con copertina ritagliabile 16:9, controlli di zoom, sostituzione, galleria immagini e allegati PDF. Usare cropper client-side ed esportare una nuova immagine prima dell’upload. Conservare i file in Supabase Storage e i metadati come righe media legate all’evento; mantenere l’API di modifica protetta da autorizzazione owner/admin.

## Boundaries & Constraints

**Always:** Accettare solo JPEG, PNG, WebP e PDF; massimo 4 MiB per file e 10 allegati per evento, con validazione server-side di tipo/dimensione; autorizzare upload, sostituzione e rimozione solo a owner/admin; usare Supabase Storage e migrazione additiva; preservare `imageUrl` esistente e i file legacy.

**Ask First:** Nessuno spostamento o rimozione dei file esistenti; nessuna conversione/ottimizzazione PDF.

**Never:** Non scrivere media in `public/` o filesystem effimero; non fidarsi del solo MIME dichiarato dal browser; non esporre la service-role key al client.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Sostituzione copertina | Nuova immagine JPEG/PNG/WebP | Preview ritagliata 16:9 e copertina sostituita dopo salvataggio | La vecchia resta se upload/update fallisce |
| Ritaglio/zoom | Immagine selezionata, crop e zoom | Crop esportato e salvato come cover | Input non decodificabile rifiutato |
| Upload multiplo | Fino a 10 immagini/PDF, ciascuno ≤4 MiB | File salvati e associati all’evento | Tipo/dimensione/count non valido rifiutato |
| Rimozione allegato | ID media appartenente all’evento | Record e file rimossi | ID estraneo/non esistente rifiutato |

</frozen-after-approval>

## Code Map

- `app/events/[slug]/edit/page.tsx` -- form protetto, cropper/zoom cover e lista media.
- `app/api/events/[id]/route.ts` -- autorizzazione esistente e aggiornamento evento/upload.
- `app/events/[slug]/page.tsx` -- copertina, immagini aggiuntive e link PDF.
- `app/lib/supabase.ts` -- client server-side Supabase Storage.
- `prisma/schema.prisma`, `prisma/migrations/` -- media collegati all’evento.
- `lib/event-media.test.mjs` -- validazione media e limiti upload.

## Tasks & Acceptance

**Execution:**
- [x] `prisma/schema.prisma`, `prisma/migrations/` -- aggiungere modello media evento con ordinamento, tipo, nome, URL, MIME e dimensione.
- [x] `app/api/events/[id]/route.ts`, `app/lib/supabase.ts` -- validare owner/admin, limiti, storage upload/delete e mantenere compatibile `imageUrl`.
- [x] `app/events/[slug]/edit/page.tsx` -- crop/zoom copertina, sostituzione, upload multiplo immagini/PDF e rimozione allegati.
- [x] `app/events/[slug]/page.tsx` -- mostrare galleria e PDF apribili/scaricabili.
- [x] `lib/event-media.test.mjs`, documentazione API/runbook -- coprire validazione e aggiornare istruzioni storage.

**Acceptance Criteria:**
- Given un evento modificabile, when l’utente sceglie una nuova copertina e regola crop/zoom, then la preview 16:9 corrisponde al file salvato.
- Given fino a 10 immagini/PDF supportati entro 4 MiB, when salva l’evento, then la pagina pubblica mostra le immagini e offre link ai PDF.
- Given un file non valido/troppo grande/count oltre limite o un utente non autorizzato, when tenta l’upload, then il server rifiuta senza sostituire la copertina attuale.
- Given un evento precedente con sola `imageUrl`, when viene aperto o modificato, then la copertina esistente rimane disponibile.

</frozen-after-approval>

## Spec Change Log

## Design Notes

Il riferimento visuale Figma è `https://www.figma.com/design/gZ8nlAeYGaikwhFy8xBtIj`. La copertina è distinta dagli allegati: una sola cover con crop/zoom, più file media ordinati per evento.

## Verification

**Commands:**
- `node --experimental-strip-types --test lib/event-media.test.mjs` -- expected: validation and upload metadata tests pass.
- `npx prisma generate` -- expected: generated client includes event media relation.
- `npx tsc --noEmit --incremental false` -- expected: no TypeScript errors.
- `npx eslint app/events/[slug]/edit app/api/events/[id] app/events/[slug]` -- expected: no lint errors.

**Manual checks:**
- Edit an event on desktop/mobile; crop and zoom cover, replace it, add multiple images/PDFs, save, and verify public gallery/download links.
