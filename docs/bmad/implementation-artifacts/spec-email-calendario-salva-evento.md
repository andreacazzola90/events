---
title: 'Email calendario nel profilo e pulsante "Salva nel calendario"'
type: 'feature'
created: '2026-09-26'
status: 'done'
baseline_commit: 'd14869d24703855c59e44ae1733f3b6f7b54e6e0'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** L'utente non ha modo di portare un evento creato nel proprio calendario personale.

**Approach:** Nel tab Profilo aggiungere un campo "Add to calendar" dove salvare un'email calendario. Nella pagina di dettaglio evento (dove si atterra dopo la creazione), se l'utente loggato ha un'email calendario impostata, mostrare il pulsante "Salva nel calendario" che invia a quell'email un invito con allegato `.ics` dell'evento.

## Boundaries & Constraints

**Always:** email calendario opzionale, validata lato server (formato email, max 254 caratteri), normalizzata (trim + lowercase); stringa vuota = rimozione (null). Endpoint protetti con `withAuth`. Il pulsante è visibile solo a utenti loggati con email calendario impostata. Invio via `createMailTransport`/`getMailFrom` esistenti. Testi UI in italiano.

**Ask First:** invio automatico alla creazione; invio a email diverse da quella salvata nel profilo.

**Never:** nessuna verifica/double opt-in dell'email calendario; nessuna integrazione OAuth con Google/Outlook; nessuna nuova dipendenza npm per generare l'ICS.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Salva email | `PUT {calendarEmail:"A@x.it "}` | salvata `a@x.it`, 200 | N/A |
| Email non valida | `PUT {calendarEmail:"foo"}` | 400, messaggio italiano | toast errore |
| Rimuovi email | `PUT {calendarEmail:""}` | salvata `null`, pulsante nascosto | N/A |
| Evento con ora | date `2026-10-01` o `01/10/2026`, time `21:00` | VEVENT con `DTSTART;TZID=Europe/Rome:20261001T210000`, durata 2h | N/A |
| Evento senza ora | time vuoto/non valido | VEVENT all-day `DTSTART;VALUE=DATE:20261001`, `DTEND` giorno dopo | N/A |
| Data non parsabile | date `"prossimo sabato"` | 422 "Data evento non valida" | toast errore |
| Nessuna email calendario | POST invio | 400 | toast errore |
| SMTP non configurato | `SMTP_PASS` assente | 503 "Invio email non configurato" | toast errore |

</frozen-after-approval>

## Code Map

- `prisma/schema.prisma` -- modello `User`
- `prisma/migrations/` -- migrazioni SQL manuali datate
- `app/lib/mailer.ts` -- transport nodemailer (null se SMTP non configurato)
- `app/lib/auth-helpers.ts` -- `withAuth(userId => ...)`
- `app/api/account/password/route.ts` -- pattern route account
- `app/account/page.tsx` -- tab Profilo
- `app/events/[slug]/page.tsx` -- dettaglio evento server-side (ha già `session`, `sessionUserId`)
- `lib/event-scan-groups.test.mjs` -- pattern test `node --test`

## Tasks & Acceptance

**Execution:**
- [x] `prisma/schema.prisma` + `prisma/migrations/20260926120000_add_user_calendar_email/migration.sql` -- aggiungere `calendarEmail String?` a `User` (`ALTER TABLE "User" ADD COLUMN "calendarEmail" TEXT;`) -- persistenza
- [x] `lib/calendar-ics.ts` -- funzioni pure `normalizeCalendarEmail(input)` (ritorna `{ok, value|error}`) e `buildEventIcs(event, {uid, url})`: parse date `YYYY-MM-DD`/`DD/MM/YYYY`, time `HH:MM`, escaping testo RFC 5545 (`\\ ; , \n`), CRLF, line folding a 75 ottetti, `METHOD:PUBLISH`, `VTIMEZONE` Europe/Rome; ritorna null se data non valida -- logica testabile
- [x] `lib/calendar-ics.test.mjs` -- test `node:test` per i casi della matrice (validazione email, con ora, senza ora, data invalida, escaping) -- copertura edge case
- [x] `app/api/account/calendar-email/route.ts` -- `GET` ritorna `{calendarEmail}`; `PUT` valida e salva -- API profilo
- [x] `app/api/events/[id]/calendar/route.ts` -- `POST` con `withAuth`: carica user e evento (404 se assente), genera ICS, invia mail con allegato `evento.ics` (`text/calendar; method=PUBLISH`) e link alla pagina evento -- invio
- [x] `app/account/page.tsx` -- nel tab Profilo sezione "📅 Add to calendar" con input email, pulsante Salva, testo esplicativo; carica valore via GET al mount -- UI profilo
- [x] `app/events/[slug]/SaveToCalendarButton.tsx` + `app/events/[slug]/page.tsx` -- componente client con stato loading e toast; la page legge `calendarEmail` via prisma per `sessionUserId` e rende il pulsante accanto al titolo solo se presente -- UI evento

**Acceptance Criteria:**
- Given un utente con email calendario salvata, when apre un evento appena creato, then vede "Salva nel calendario" e al click riceve toast di successo e un'email con `.ics` importabile.
- Given un utente senza email calendario o non loggato, when apre un evento, then il pulsante non è mostrato.
- Given il tab Profilo, when l'utente ricarica la pagina, then il campo mostra l'email calendario salvata.

## Design Notes

Durata default 2h per eventi con ora (nessun campo fine nel modello). `UID` = `event-{id}@eventscanner` così reimportazioni aggiornano lo stesso evento. Nessuna conversione UTC: si usa `TZID=Europe/Rome` con blocco VTIMEZONE (regole CET/CEST).

## Verification

**Commands:**
- `node --experimental-strip-types --test lib/calendar-ics.test.mjs` -- expected: tutti i test passano
- `npx prisma generate && npx tsc --noEmit -p .` -- expected: nessun nuovo errore di tipo
- `npx eslint app/api/account/calendar-email app/api/events/[id]/calendar app/events/[slug] lib/calendar-ics.ts` -- expected: nessun errore

## Suggested Review Order

**Invio invito calendario**

- Entry point: auth, lookup email calendario, generazione ICS, invio con allegato `icalEvent`.
  [`calendar/route.ts:16`](../../../app/api/events/[id]/calendar/route.ts#L16)

- Allegato inviato come `text/calendar; method=PUBLISH` tramite nodemailer.
  [`calendar/route.ts:71`](../../../app/api/events/[id]/calendar/route.ts#L71)

**Generazione ICS**

- Costruzione VCALENDAR: evento con ora (TZID Europe/Rome) o all-day.
  [`calendar-ics.ts:131`](../../../lib/calendar-ics.ts#L131)

- DURATION invece di DTEND per durata corretta anche a cavallo del cambio ora.
  [`calendar-ics.ts:153`](../../../lib/calendar-ics.ts#L153)

- Folding RFC 5545 a 75 ottetti, sicuro per caratteri multibyte.
  [`calendar-ics.ts:91`](../../../lib/calendar-ics.ts#L91)

**Email calendario nel profilo**

- Validazione/normalizzazione condivisa; vuoto = rimozione.
  [`calendar-ics.ts:20`](../../../lib/calendar-ics.ts#L20)

- PUT rifiuta body malformati per non cancellare l'email per errore.
  [`calendar-email/route.ts:23`](../../../app/api/account/calendar-email/route.ts#L23)

- Form "Add to calendar" nel tab Profilo; Salva disabilitato finché il valore non è caricato.
  [`account/page.tsx:68`](../../../app/account/page.tsx#L68)

**Pulsante nella pagina evento**

- Lettura server-side dell'email calendario per l'utente in sessione.
  [`page.tsx:161`](../../../app/events/[slug]/page.tsx#L161)

- Pulsante reso solo se l'email è impostata.
  [`page.tsx:211`](../../../app/events/[slug]/page.tsx#L211)

- Componente client con loading e toast.
  [`SaveToCalendarButton.tsx:13`](../../../app/events/[slug]/SaveToCalendarButton.tsx#L13)

**Periferiche**

- Nuova colonna nullable su `User` + migrazione.
  [`schema.prisma:42`](../../../prisma/schema.prisma#L42)

- Test node:test sui casi della matrice I/O.
  [`calendar-ics.test.mjs:1`](../../../lib/calendar-ics.test.mjs#L1)
