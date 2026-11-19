---
title: 'Correggere gli overlay di verifica selettori per Visit Pedemontana'
type: 'bugfix'
created: '2026-11-19'
status: 'done'
baseline_commit: 'fd50d1f4da6703775107de02a5d2f3061d1645d9'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Il pulsante “Verifica selettori” produce un riepilogo degli elementi individuati, ma nello screenshot possono mancare i riquadri colorati su Visit Pedemontana. L’ispezione degli eventi attraversa gli Shadow DOM e può restringere la ricerca al contenitore del listing; l’iniezione degli overlay invece interroga solo `document` e non usa quel contenitore. I risultati numerici e l’evidenziazione visiva possono quindi divergere.

**Approach:** Allineare l’iniezione degli overlay alla logica di ricerca già usata dall’ispezione: attraversare gli Shadow DOM aperti e rispettare il contenitore listing per gli eventi. Conservare colori, etichette, screenshot e comportamento esistenti per le pagine con DOM tradizionale.

## Boundaries & Constraints

**Always:** Mantenere invariati endpoint, autenticazione, formato della risposta e comportamento di conteggio; gli overlay devono evidenziare gli stessi nodi evento selezionati dall’ispezione, oltre ai selettori di paginazione rilevati.

**Ask First:** Modifiche al formato o alla presentazione dello screenshot, nuove opzioni di configurazione o cambiamenti al modo in cui sono conteggiati gli eventi.

**Never:** Cambiare il crawler o i selettori salvati delle sorgenti; introdurre dipendenze; rimuovere il supporto esistente alle pagine normali.

</frozen-after-approval>

## Code Map

- `app/api/admin/cron-sources/inspect/route.ts` -- raccolta dei risultati, iniezione dei riquadri e generazione dello screenshot.
- `app/cron/CronAdminClient.tsx` -- invia i selettori correnti e mostra il riepilogo e lo screenshot; non richiede modifiche se la risposta resta compatibile.

## Tasks & Acceptance

**Execution:**
- [x] `app/api/admin/cron-sources/inspect/route.ts` -- rendere la ricerca usata dagli overlay compatibile con Shadow DOM e contenitore listing -- visualizzare gli stessi elementi individuati dalla verifica.
- [x] `app/api/admin/cron-sources/inspect/route.ts` -- verificare tipi e lint del route handler -- evitare regressioni nella generazione dello screenshot.

**Acceptance Criteria:**
- Given eventi e selettori che corrispondono a elementi in uno Shadow DOM aperto, when l’admin preme “Verifica selettori”, then lo screenshot evidenzia gli elementi trovati con i colori e le etichette previsti.
- Given un selettore del contenitore listing, when la verifica e l’overlay cercano le card evento, then l’overlay evidenzia solo le corrispondenze all’interno del listing.
- Given una pagina senza Shadow DOM, when viene eseguita la verifica, then conteggi, overlay, riepilogo e screenshot mantengono il comportamento attuale.

## Verification

**Commands:**
- `npx eslint app/api/admin/cron-sources/inspect/route.ts` -- nessun errore.
- `npx tsc --noEmit` -- nessun errore di tipo.

**Manual checks:**
- Usare “Verifica selettori” su Visit Pedemontana e Visit Schio e controllare che lo screenshot mostri i riquadri degli eventi individuati, preservando la paginazione color ambra.

## Suggested Review Order

**Ricerca ed evidenziazione**

- Cerca gli stessi elementi nello Shadow DOM usati per disegnare gli overlay.
  [`route.ts:321`](../../app/api/admin/cron-sources/inspect/route.ts#L321)
- Limita le card evidenziate al listing configurato.
  [`route.ts:348`](../../app/api/admin/cron-sources/inspect/route.ts#L348)
- Disegna le card evento mantenendo il riquadro verde.
  [`route.ts:402`](../../app/api/admin/cron-sources/inspect/route.ts#L402)
- Applica la ricerca Shadow DOM anche ai selettori di paginazione.
  [`route.ts:416`](../../app/api/admin/cron-sources/inspect/route.ts#L416)
