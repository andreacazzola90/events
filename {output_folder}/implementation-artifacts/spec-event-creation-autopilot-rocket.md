---
title: 'Creazione evento autopilota con razzo'
type: 'feature'
created: '2026-11-03'
status: 'done'
baseline_commit: '1c71f7c'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Dopo la scansione l'utente deve rivedere la bozza e premere Pubblica; l'attesa mostra solo uno spinner. Resta troppo a lungo sul telefono.

**Approach:** Autopilota: appena la scansione restituisce eventi validi, mostrare la scheda ottimistica e pubblicare tutto automaticamente, fermandosi sull'editor solo in caso di problemi. Un'animazione (bambino che costruisce, posiziona, accende e lancia un razzo) segue le fasi reali; al 201 toast di conferma e pagina evento con "Modifica" in evidenza.

## Boundaries & Constraints

**Always:** Fasi legate a stati reali: Costruisce = scansione (immagine, PDF, link, immagine condivisa); Posiziona = attesa ritaglio copertina, sezioni locandina e controllo duplicati; Accende = POST in corso; Lancio = tutti i salvataggi confermati. Scheda ottimistica dopo la scansione con dati reali e copertina. Ritaglio/privacy, duplicati e salvataggio durevole prima della conferma; retry dei soli non salvati. role=status, testo della fase sempre leggibile, prefers-reduced-motion = scena statica. Interruttore "Pubblica automaticamente" (predefinito attivo, persistito in localStorage). Illustrazione SVG/CSS inline con i token del sito.

**Ask First:** Asset esterni o librerie di animazione, modifiche alle API server, completamento ad app chiusa (rinviato).

**Never:** Percentuali o progressi inventati; pubblicare con duplicati, titolo/data mancanti o copertina fallita; navigare prima del 201; scena di lancio oltre 1 s (saltata con reduced motion); eventi reali nei test.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Evento singolo valido | Scansione ok, crop ok, nessun duplicato | Build→Posiziona→Accende→Lancio, toast, `/events/{slug}?nuovo=1` | N/A |
| Più eventi validi | N eventi | Pubblicazione batch esistente, toast "N eventi creati", home | Falliti restano in editor |
| Duplicato | Almeno un match | Autopilota fermato, editor con motivo | Pubblicazione manuale |
| Dati mancanti | Titolo o data vuoti / "non trovato" | Fermato con motivo | Editor |
| Copertina fallita | crop `failed` | Fermato con messaggio crop esistente | Editor |
| Errore salvataggio | POST non ok | Scena interrotta, errore, bozza conservata | Retry manuale |
| Autopilota spento | Interruttore off | Flusso attuale invariato | N/A |
| Reset/nuova scansione | Durante Posiziona/Accende | Nessuna pubblicazione obsoleta | Guardia scanId |

</frozen-after-approval>

## Code Map

- `app/crea/page.tsx` -- stato bozze, `handleNewEvents`, `checkDuplicates`, `imageCropStatus`/`posterSectionsPending`, `handleSaveAll` (batch, guardia in-flight, redirect), scheda ottimistica.
- `app/components/ImageUploader.tsx` -- scansione immagine/PDF con `LoadingAnimation phase="scan-image"`.
- `app/components/LoadingAnimation.tsx` -- indicatore condiviso con fasi `scan-*`, `shared-image`, `saving`.
- `app/events/[slug]/page.tsx` -- link Modifica (~riga 234), punto per il banner `?nuovo=1`.
- `app/globals.css` -- token e stili `.request-status`.
- `lib/draft-image-crop.ts` -- `DraftImageCropStatus`, messaggi di fallimento.
- `cypress/e2e/create-event-via-image.cy.ts` -- test mock del flusso manuale.

## Tasks & Acceptance

**Execution:**
- [x] `lib/event-autopilot.ts` -- funzione pura `getAutopilotDecision({ events, duplicates, duplicatesChecked, cropStatus, sectionsPending })` → `wait | publish | stop(reason)` e mappa fase→etichetta -- logica testabile senza React.
- [x] `lib/event-autopilot.test.mjs` -- casi della matrice (attesa, publish, ogni motivo di stop).
- [x] `app/components/RocketLaunchAnimation.tsx` -- scena SVG bambino+razzo con prop `stage: build|position|ignite|launch|stopped`, callback `onLaunchEnd`, reduced motion, role=status.
- [x] `app/globals.css` -- keyframe per fase, dimensioni stabili mobile/desktop, `@media (prefers-reduced-motion)`.
- [x] `app/components/LoadingAnimation.tsx` -- fasi di scansione rendono la scena `build` mantenendo messaggio e `data-loading-phase`.
- [x] `app/crea/page.tsx` -- interruttore persistito; tracciare completamento check duplicati; effetto che valuta la decisione e chiama `handleSaveAll` una sola volta per scansione; durante l'autopilota mostrare scena + scheda ottimistica (con copertina) al posto dell'editor; su stop mostrare editor e motivo; dopo successo riprodurre il lancio poi navigare (`?nuovo=1` per evento singolo).
- [x] `app/events/[slug]/page.tsx` -- con `?nuovo=1` banner "Evento pubblicato" e pulsante Modifica primario.
- [x] `cypress/e2e/create-event-via-image.cy.ts` -- test manuali esistenti con autopilota disattivato; nuovi test mock: pubblicazione automatica singola, stop su duplicato, reduced motion.

**Acceptance Criteria:**
- Given autopilota attivo e scansione valida, when crop e check duplicati terminano, then parte un solo POST senza interazione.
- Given una pubblicazione automatica riuscita, when arriva il 201, then appare il toast e la pagina evento mostra Modifica in evidenza.
- Given prefers-reduced-motion, when l'autopilota avanza, then la scena è statica ma l'etichetta di fase cambia.

## Spec Change Log

## Design Notes

L'autopilota riusa `handleSaveAll`, quindi concorrenza, retry, duplicati 409 e toast restano invariati. Il lancio (≤1 s) è l'unica attesa aggiunta dopo il 201: evento già salvato, nessuna conferma anticipata. L'interruttore protegge chi vuole rivedere e permette ai test legacy di restare invariati.

## Verification

**Commands:**
- `node --experimental-strip-types --test lib/event-autopilot.test.mjs` -- decisioni corrette.
- `npx cypress run --spec cypress/e2e/create-event-via-image.cy.ts --env parallelCoverOnly=true --config trashAssetsBeforeRuns=false` -- tutto mock.
- `npx tsc --noEmit` e ESLint sui file toccati.

**Manual checks:**
- Screenshot 390px e 1280px di ogni fase, con e senza reduced motion, sul server locale.

## Implementation Notes

Aggiunte rispetto al piano, coerenti con l'intento: stop `review-requested` per PDF riassunti; `coverMissing` (immagine senza copertina); pulsante "Rivedi prima di pubblicare" in fase position (stop `user-stopped`); `?nuovo=1` anche nel flusso manuale a evento singolo; la firma di `getAutopilotDecision` include `coverMissing` e `needsReview`.

Patch dopo review (2026-11-03): esito di `handleSaveAll` diverso da `navigated` → stop (niente blocco in ignite); all'unmount l'autopilota si annulla e non si naviga se l'utente ha lasciato /crea; localStorage protetto da try/catch; errore sezioni locandina non blocca l'attesa; pubblicazione manuale azzera il motivo di pausa; nessun autopilota con 0 eventi; data non interpretabile = dato mancante; sentinel "non trovato" solo a inizio valore; niente toast d'errore duplicato; `?nuovo=1` rimosso dall'URL dopo la visualizzazione.

Verifica: test node 6/6; tsc ed ESLint puliti; Cypress suite autopilota 6/6; suite completa 31 pass con 7 fallimenti preesistenti identici alla baseline (picker mobile ×6, "retains a failed manual cover…"). Un errore intermittente del dev server Next (`loadManifest: Unexpected end of JSON input`) può far fallire un beforeEach: non legato alla modifica.

## Suggested Review Order

**Decisione dell'autopilota**

- Entry point: regole pure wait/publish/stop, ordine dei controlli.
  [`event-autopilot.ts:47`](../../lib/event-autopilot.ts#L47)

- Effetto che valuta la decisione e pubblica una sola volta per run.
  [`crea/page.tsx:590`](../../app/crea/page.tsx#L590)

- Avvio con run id; si disattiva con toggle spento o zero eventi.
  [`crea/page.tsx:147`](../../app/crea/page.tsx#L147)

**Conferma e atterraggio**

- Il lancio parte solo dopo il 201, con timer massimo 1 s.
  [`crea/page.tsx:157`](../../app/crea/page.tsx#L157)

- Attesa del lancio prima di reset e navigazione, salvo unmount.
  [`crea/page.tsx:539`](../../app/crea/page.tsx#L539)

- Banner con Modifica; rimuove `?nuovo=1` dopo la visualizzazione.
  [`NewEventBanner.tsx:8`](../../app/events/[slug]/NewEventBanner.tsx#L8)

**Interfaccia e animazione**

- Pannello razzo al posto dell'editor, con "Rivedi prima di pubblicare".
  [`crea/page.tsx:895`](../../app/crea/page.tsx#L895)

- Pausa con motivo leggibile ed editor riaperto.
  [`crea/page.tsx:913`](../../app/crea/page.tsx#L913)

- Interruttore persistito in localStorage.
  [`crea/page.tsx:809`](../../app/crea/page.tsx#L809)

- Scena SVG bambino+razzo, role=status, fase come attributo.
  [`RocketLaunchAnimation.tsx:14`](../../app/components/RocketLaunchAnimation.tsx#L14)

- Pose statiche; keyframe solo con motion consentito.
  [`globals.css:2162`](../../app/globals.css#L2162)

- Le fasi di scansione mostrano lo stage build.
  [`LoadingAnimation.tsx:17`](../../app/components/LoadingAnimation.tsx#L17)

**Test**

- Toggle iniettato prima del load: test legacy con autopilota spento.
  [`create-event-via-image.cy.ts:5`](../../cypress/e2e/create-event-via-image.cy.ts#L5)

- Suite autopilota: lancio, pause, retry, stop manuale.
  [`create-event-via-image.cy.ts:714`](../../cypress/e2e/create-event-via-image.cy.ts#L714)
