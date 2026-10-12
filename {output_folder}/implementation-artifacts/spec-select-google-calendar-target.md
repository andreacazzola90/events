---
title: 'Selezione calendario Google di destinazione'
type: 'feature'
created: '2026-10-12'
status: 'in-review'
baseline_commit: 'cd81ec0d7edd407b16a040324ebf210c1c089a6e'
context: []
---

<frozen-after-approval reason="human-renegotiated scope on 2026-10-12: target calendar selection confirmed">

## Intent

**Problem:** Gli eventi vengono inviati sempre al calendario Google `primary`, quindi non compaiono nel calendario personale atteso (per esempio “Eventi”, giallo).

**Approach:** Caricare i calendari posseduti dall’account Google collegato, inclusi nome e colore, e popolare il select esistente “Tipo di evento Google Calendar”. Salvare l’ID scelto e usarlo come destinazione della sincronizzazione automatica; il calendario selezionato determina il colore visibile in Google Calendar.

## Boundaries & Constraints

**Always:** Preservare OAuth sicuro, token cifrati, idempotenza delle consegne e calendari precedenti su `primary` finché l’utente non seleziona una destinazione.

**Ask First:** Nessuna modifica o spostamento di eventi già creati; nessun accesso a calendari condivisi che richieda scope di scrittura più ampi.

**Never:** Non usare nomi/colori statici; non ripiegare silenziosamente su `primary` se il calendario scelto viene eliminato; non richiedere accesso alla lettura degli eventi.

</frozen-after-approval>

## Code Map

- `app/lib/google-calendar.ts` -- OAuth scopes, listing Google paginato e consegna idempotente all'ID selezionato.
- `app/api/account/google-calendar/calendars/route.ts` -- elenco e validazione destinazione.
- `app/account/page.tsx` -- select esistente popolato con nomi/colori e salvataggio automatico della destinazione.
- `prisma/schema.prisma`, `prisma/migrations/20261012140000_add_google_calendar_target/migration.sql` -- persistenza `calendarId`, default `primary`.
- `lib/google-calendar.test.mjs` -- regressioni worker, tipo evento e route OAuth.
- `docs/API_REFERENCE.md`, `docs/DEPLOY_RUNBOOK.md` -- API e operatività OAuth.

## Tasks & Acceptance

**Execution:**
- [x] `prisma/schema.prisma`, `prisma/migrations/20261012140000_add_google_calendar_target/migration.sql` -- salvare il calendario selezionato con default compatibile `primary`.
- [x] `app/lib/google-calendar.ts`, `app/api/account/google-calendar/route.ts`, `app/api/account/google-calendar/callback/route.ts` -- leggere calendari/colori, richiedere lo scope minimo e mantenere la destinazione nel worker.
- [x] `app/api/account/google-calendar/calendars/route.ts` -- esporre lista e salvataggio validato dell'ID.
- [x] `app/account/page.tsx` -- mostrare i nomi reali nel select esistente, visualizzare il colore e consentire ricollegamento OAuth.
- [x] `lib/google-calendar.test.mjs` -- testare paginazione, colore, selezione, ID non valido, retry e calendario rimosso.
- [x] `docs/API_REFERENCE.md`, `docs/DEPLOY_RUNBOOK.md` -- documentare endpoint, scope e migration.

**Acceptance Criteria:**
- Given un utente collegato a Google Calendar, when apre le preferenze, then vede i calendari posseduti con nome e colore Google nel select esistente.
- Given la selezione “Eventi”, when una consegna viene processata, then l’evento viene creato nel calendario Google ID di “Eventi” e mostra lì il colore assegnato da Google.
- Given un collegamento OAuth precedente senza calendar-list scope, when l’elenco viene caricato, then l’interfaccia permette di ricollegare Google per concederlo.
- Given un calendario selezionato poi eliminato, when una consegna fallisce con 404, then non viene trasferita silenziosamente in `primary`.
- Given una pagina di dettaglio evento, when viene visualizzata, then il pulsante manuale email “Salva nel calendario” non è presente.

## Spec Change Log

## Verification

**Commands:**
- `node --experimental-strip-types --test lib/google-calendar.test.mjs` -- expected: calendar integration tests pass, listing returns colors, and selected ID is used by delivery.
- `npx prisma generate` -- expected: generated client includes selected calendar field.
- `npx prisma validate` -- expected: schema validates.
- `npx tsc --noEmit --incremental false` -- expected: no TypeScript errors.

**Manual checks:**
- Reconnect Google, select “Eventi” and create a future event; confirm it appears once in that calendar and displays its Google-assigned color.
