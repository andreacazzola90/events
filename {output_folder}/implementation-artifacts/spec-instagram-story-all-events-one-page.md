---
title: 'Mostrare tutti gli eventi nella story Instagram'
type: 'bugfix'
created: '2026-11-06'
status: 'done'
baseline_commit: 'f1f214558a0a8ad5f51555eddc4cd8ed6f217705'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Quando gli eventi della settimana sono numerosi, la story Instagram mostra solo quelli che entrano nel layout e sostituisce gli altri con un conteggio. La story deve invece contenere tutti gli eventi in una sola immagine.

**Approach:** Adattare il layout al numero di eventi: ridurre progressivamente lo spazio occupato da ogni riga e rimuovere le miniature quando la densità lo richiede, senza escludere eventi. Mantenere il formato verticale e rendere leggibili titoli e date anche nella versione compatta.

## Boundaries & Constraints

**Always:** Includere una riga per ogni evento nell’intervallo settimanale; mantenere l’ordine per data e ora, il raggruppamento per giorno e le dimensioni 1080×1920. Usare un layout compatto e senza immagini quando necessario. Conservare generazione, upload e pubblicazione esistenti.

**Ask First:** Nessuna.

**Never:** Suddividere gli eventi su più immagini, ometterli o sostituirli con un messaggio “altri eventi”. Non modificare la selezione degli eventi della settimana né il flusso di pubblicazione Instagram.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Pochi eventi | Numero compatibile con il layout attuale | Tutti gli eventi, con miniature disponibili | Una miniatura non raggiungibile viene omessa, non l’evento |
| Molti eventi | 30 eventi distribuiti su più date | Tutti i titoli e le intestazioni data sono inclusi nella stessa immagine; layout compatto, senza miniature se necessario | Nessun evento nascosto o riepilogo di overflow |
| Nessun evento | Settimana senza eventi | Mantenere il messaggio attuale “Nessun evento in calendario” | N/A |

</frozen-after-approval>

## Code Map

- `app/api/cron/generate-instagram-story/route.ts` -- calcolo dei blocchi, dimensionamento delle righe, rendering della story e attuale riepilogo degli eventi non entrati.
- `lib/instagram-story-cron.test.mjs` -- test della generazione, del markup e del JPEG; aggiornare la regressione che oggi si aspetta eventi nascosti.

## Tasks & Acceptance

**Execution:**
- [x] `app/api/cron/generate-instagram-story/route.ts` -- adattare densità, dimensioni e uso delle miniature al numero di eventi, rimuovendo il ramo che nasconde gli eventi oltre il limite.
- [x] `lib/instagram-story-cron.test.mjs` -- verificare che un insieme numeroso di eventi sia tutto presente nel markup della story e che il JPEG resti 1080×1920; conservare i test per immagini mancanti e settimana vuota.

**Acceptance Criteria:**
- Given 30 eventi settimanali distribuiti su più date, when la story viene generata, then tutti i titoli e i gruppi per data compaiono nella stessa immagine senza riepilogo di overflow.
- Given una quantità di eventi che supera il layout standard, when la story viene generata, then il layout si compatta e rimuove le miniature se necessario, senza omettere righe.
- Given una settimana senza eventi o una miniatura non scaricabile, when la story viene generata, then il comportamento di fallback attuale resta invariato.

## Spec Change Log

## Verification

**Commands:**
- `node --test lib/instagram-story-cron.test.mjs` -- 11 test passano, inclusa la regressione sui 30 eventi.
- `npx eslint app/api/cron/generate-instagram-story/route.ts lib/instagram-story-cron.test.mjs` -- nessun errore.
- `npx tsc --noEmit --incremental false` -- nessun errore di tipo.

## Suggested Review Order

**Layout adattivo**

- La soglia mantiene il layout originale quando tutte le righe standard entrano.
  [`route.ts:127`](../../app/api/cron/generate-instagram-story/route.ts#L127)
- Nel rendering compatto le miniature spariscono e altezza e tipografia si adattano.
  [`route.ts:222`](../../app/api/cron/generate-instagram-story/route.ts#L222)

**Regressione**

- Il test verifica titoli completi, assenza di miniature e dimensioni verticali corrette.
  [`instagram-story-cron.test.mjs:239`](../../lib/instagram-story-cron.test.mjs#L239)
