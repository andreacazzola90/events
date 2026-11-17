---
title: 'Animazione più accattivante per la creazione evento'
type: 'feature'
created: '2026-11-17'
status: 'done'
baseline_commit: '13697b6633b2902af51003348e538796d028c943'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** La scena che accompagna la creazione e la pubblicazione dell’evento è poco coinvolgente e appare dentro un riquadro di sfondo.

**Approach:** Arricchire l’illustrazione esistente con scintille e particelle animate, mantenendo la scena 2D condivisa e rimuovendo i fondi/pannelli rettangolari che la incorniciano.

## Boundaries & Constraints

**Always:** Riutilizzare la scena e le fasi esistenti; mantenere messaggi, accessibilità `role="status"`, comportamento responsive e rispetto di `prefers-reduced-motion`. Le particelle devono essere decorative, non interferire con interazioni o testo, e usare gli stili/token locali.

**Ask First:** Modifiche alle fasi reali, al flusso di pubblicazione o alla durata del lancio.

**Never:** Aggiungere librerie o asset remoti; introdurre progressi o risultati simulati; rimuovere lo sfondo a schermo intero che distingue l’overlay dalla pagina sottostante.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Animazione standard | Scansione o pubblicazione con movimento consentito | Scintille/particelle decorative animate intorno all’illustrazione; nessun riquadro opaco dietro la scena | N/A |
| Movimento ridotto | `prefers-reduced-motion: reduce` | Particelle statiche o nascoste, scena e messaggi leggibili | Nessun movimento aggiuntivo |
| Mobile | Viewport stretto | Illustrazione, particelle e testo restano visibili senza overflow | N/A |

</frozen-after-approval>

## Code Map

- `app/components/RocketLaunchAnimation.tsx` -- scena SVG condivisa, da arricchire con dettagli decorativi non interattivi.
- `app/crea/page.tsx` -- pannello che avvolge l’animazione dell’autopilota.
- `app/globals.css` -- sfondi, animazioni della scena e regole per movimento ridotto.
- `cypress/e2e/create-event-via-image.cy.ts` -- verifica responsive, animazione e movimento ridotto.
- `cypress/e2e/create-event-via-link.cy.ts` -- verifica la scena condivisa durante la scansione.

## Tasks & Acceptance

**Execution:**
- [x] `app/components/RocketLaunchAnimation.tsx`, `app/globals.css` -- aggiungere particelle/scintille animate coerenti con le fasi esistenti e rimuovere il fondino rettangolare della scena, mantenendo un overlay fullscreen leggibile.
- [x] `app/crea/page.tsx` -- rimuovere l’eventuale cornice a pannello attorno alla scena dell’autopilota senza cambiare il controllo “Rivedi prima di pubblicare”.
- [x] `cypress/e2e/create-event-via-image.cy.ts`, `cypress/e2e/create-event-via-link.cy.ts` -- verificare particelle e assenza di fondi rettangolari, rispetto del movimento ridotto e assenza di overflow nelle dimensioni già coperte.

**Acceptance Criteria:**
- Given la scena di creazione o pubblicazione, when il movimento è consentito, then particelle decorative rendono l’animazione più vivace senza cambiare stati o messaggi.
- Given la scena visibile, when viene mostrata, then illustrazione e testo non sono racchiusi da un riquadro opaco, mentre l’overlay fullscreen continua a separare la scena dalla pagina.
- Given `prefers-reduced-motion`, when la scena è visibile, then i dettagli non si animano e i contenuti restano leggibili.
- Given una viewport mobile, when la scena è mostrata, then illustrazione, testo e particelle non causano overflow orizzontale.

## Verification

**Commands:**
- `npx cypress run --spec cypress/e2e/create-event-via-image.cy.ts` -- regressioni visive, responsive e movimento ridotto assenti.
- `npx cypress run --spec cypress/e2e/create-event-via-link.cy.ts` -- scena di scansione condivisa integra.
- `npx tsc --noEmit` -- attualmente fallisce solo su modifiche concorrenti non correlate in `app/api/cron/scrape-visitpedemontana/route.ts` e `lib/cron-source-scheduler.ts`.
- `npx eslint app/components/RocketLaunchAnimation.tsx app/crea/page.tsx cypress/e2e/create-event-via-image.cy.ts cypress/e2e/create-event-via-link.cy.ts` -- nessun errore sui file modificati.
- Cypress combinato: 69 passati, 3 falliti in flussi di selezione copertina e aggiornamento messaggio con movimento ridotto; stessi fallimenti rilevati prima della correzione in review e non causati dalle modifiche all’animazione.

### Review Findings

- [x] [Review][Patch] Rendere visibili le scintille SVG a croce — aggiunto il tratto ai percorsi aperti [app/globals.css:2199].
- [x] [Review][Patch] Rendere stabile il test link con movimento ridotto — l’asserzione considera `data-reduced-motion` [cypress/e2e/create-event-via-link.cy.ts:422].

## Suggested Review Order

**Composizione della scena**

- Il pannello dell’autopilota non aggiunge più una cornice opaca attorno alla scena.
  [`page.tsx:942`](../../app/crea/page.tsx#L942)

- Le scintille decorative sono aggiunte alla scena SVG condivisa, senza cambiare gli stati.
  [`RocketLaunchAnimation.tsx:142`](../../app/components/RocketLaunchAnimation.tsx#L142)

**Stile, animazione e accessibilità**

- La scena e il pannello restano trasparenti, mentre l’overlay mantiene lo sfondo fullscreen.
  [`globals.css:2093`](../../app/globals.css#L2093)

- I tratti SVG rendono visibili le scintille a croce.
  [`globals.css:2199`](../../app/globals.css#L2199)

- Le animazioni decorative seguono ciascuna fase e rispettano il movimento ridotto.
  [`globals.css:2330`](../../app/globals.css#L2330)

**Verifiche**

- Il flusso autopilota verifica sfondo trasparente, particelle e modalità ridotta.
  [`create-event-via-image.cy.ts:847`](../../cypress/e2e/create-event-via-image.cy.ts#L847)

- La scansione link verifica particelle visibili e overlay fullscreen preservato.
  [`create-event-via-link.cy.ts:419`](../../cypress/e2e/create-event-via-link.cy.ts#L419)
