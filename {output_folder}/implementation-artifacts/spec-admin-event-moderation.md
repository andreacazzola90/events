---
title: 'Admin Event Moderation'
type: 'feature'
created: '2026-11-09'
status: 'in-review'
baseline_commit: '67dfcef361aba1405bcffdcefed1285cac1d3cfc'
context:
  - '{project-root}/docs/API_REFERENCE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Gli amministratori non hanno un modo per rimuovere un evento o nasconderlo temporaneamente dal sito; il modello e le query pubbliche non prevedono bozze.

**Approach:** Aggiungere uno stato di pubblicazione retrocompatibile e controlli riservati agli admin nella schermata di modifica. Gli eventi in bozza restano accessibili dalla vista eventi admin per poterli ripubblicare, ma non compaiono nelle superfici pubbliche.

## Boundaries & Constraints

**Always:** Gli eventi esistenti e quelli creati normalmente restano pubblicati per impostazione predefinita. Solo un admin autenticato può cambiare lo stato di pubblicazione o eliminare un evento; applicare la stessa autorizzazione lato API. Gli eventi in bozza devono essere esclusi da pagine e API pubbliche, risultati correlati, preferiti e sitemap. La vista eventi admin deve mostrare e distinguere le bozze. Invalidare le cache pubbliche dopo ogni modifica.

**Ask First:** Nessuna.

**Never:** Non consentire a utenti non admin di modificare lo stato o cancellare eventi. Non rendere pubblica una bozza tramite accesso diretto alla pagina o all'API. Non modificare o cancellare eventi diversi da quello selezionato.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Admin mette in bozza | Admin autenticato, evento pubblicato | Evento salvato come bozza e rimosso dalle superfici pubbliche; resta nella lista admin | Errore esplicito, evento invariato |
| Admin ripubblica | Admin autenticato, evento in bozza | Evento torna visibile pubblicamente e le cache sono aggiornate | Errore esplicito, stato invariato |
| Utente non admin tenta un'azione | Sessione assente o non admin | Stato HTTP 401/403, nessuna modifica | Messaggio d'errore |
| Admin elimina un evento con preferiti o media | ID evento valido | Eliminazione definitiva e pulizia dei riferimenti dipendenti | Se l'eliminazione DB fallisce, riportare errore senza successo apparente |
| Evento inesistente o ID non valido | Richiesta admin | Nessuna modifica | Risposta 400/404 |

</frozen-after-approval>

## Code Map

- `prisma/schema.prisma` -- aggiungere il flag pubblicato mantenendo validi i record esistenti.
- `prisma/migrations/` -- migration SQL con default pubblicato.
- `app/api/events/[id]/route.ts` -- endpoint admin-only per stato e cancellazione; GET protetto per le bozze.
- `app/api/events/route.ts` -- filtrare bozze nelle richieste pubbliche e consentirle solo con `includeDrafts=true` in sessione admin.
- `app/events/[slug]/page.tsx` -- nascondere le bozze, inclusi suggerimenti e parametri statici.
- `lib/public-event-list.ts`, `app/sitemap.ts`, `app/api/favorites/route.ts` -- mantenere le bozze fuori dalle superfici pubbliche.
- `app/account/page.tsx`, `app/components/EventPreview.tsx` -- includere e contrassegnare le bozze nella lista admin.
- `app/events/[slug]/edit/page.tsx` -- controlli admin per bozza/ripubblicazione e cancellazione con conferma.
- `app/lib/supabase.ts` -- riuso della cancellazione dei file associati dove applicabile.
- `docs/API_REFERENCE.md` -- documentare le nuove operazioni e autorizzazioni.

## Tasks & Acceptance

**Execution:**
- [x] `prisma/schema.prisma`, `prisma/migrations/` -- aggiungere `isPublished` predefinito a `true` e la migration corrispondente -- mantenere visibili gli eventi esistenti.
- [x] `app/api/events/[id]/route.ts` -- implementare `PATCH { isPublished: boolean }` e `DELETE` admin-only; cancellare in transazione preferiti e record, poi pulire i file storage associati e riportare eventuali errori di pulizia -- impedire modifiche non autorizzate e successi silenziosamente parziali.
- [x] `app/api/events/route.ts`, `app/events/[slug]/page.tsx`, `lib/public-event-list.ts`, `app/sitemap.ts`, `app/api/favorites/route.ts` -- escludere le bozze dalle risposte e pagine pubbliche; permetterne la lettura admin necessaria alla gestione -- evitare esposizioni tramite URL diretti, ricerca o cache.
- [x] `app/account/page.tsx`, `app/components/EventPreview.tsx`, `app/events/[slug]/edit/page.tsx` -- richiedere `includeDrafts=true` solo nella lista admin, distinguere le bozze e aggiungere “Metti in bozza”/“Ripubblica” e “Elimina” con stato di caricamento, conferma e feedback -- rendere la funzione accessibile dalla UI.
- [x] `docs/API_REFERENCE.md` -- aggiornare la documentazione API -- descrivere autorizzazioni, risposte e stati.

**Acceptance Criteria:**
- Given un evento esistente prima della migration, when la migration è applicata, then resta pubblicato senza modifiche manuali.
- Given un admin nella schermata di modifica, when seleziona “Metti in bozza”, then la PATCH aggiorna lo stato, le cache pubbliche sono invalidate e l'evento non è accessibile nelle pagine o API pubbliche.
- Given un admin nella lista eventi, when apre una bozza e la ripubblica, then l'evento riappare nelle superfici pubbliche dopo l'invalidazione delle cache.
- Given un utente non admin, when invoca direttamente l'API di stato o cancellazione, then riceve 401/403 e il record non cambia.
- Given un admin che conferma l'eliminazione, when il database completa l'operazione, then il record, i preferiti e i file associati sono rimossi e la UI segnala l'esito o un errore esplicito di pulizia.

## Spec Change Log

## Design Notes

`isPublished` con default `true` evita di reinterpretare i record preesistenti. La bozza è uno stato reversibile, distinto dalla cancellazione definitiva. La lista admin deve poter caricare anche le bozze, senza ampliare l'accesso delle richieste pubbliche.

## Verification

**Commands:**
- `npx prisma validate` -- schema Prisma valido.
- `npx tsc --noEmit` -- nessun errore di tipo.
- `npx eslint <file interessati>` -- nessun errore lint nei file modificati.

## Suggested Review Order

**Authorization and deletion**

- Le azioni admin concentrano autenticazione, transazione, pulizia storage e invalidazione cache.
  [`route.ts:237`](../../app/api/events/%5Bid%5D/route.ts#L237)

- La cancellazione rimuove prima i riferimenti e segnala esplicitamente le pulizie parziali.
  [`route.ts:282`](../../app/api/events/%5Bid%5D/route.ts#L282)

**Publication and public visibility**

- Il default SQL mantiene pubblicati i record esistenti, mentre Prisma espone il nuovo stato.
  [`migration.sql:1`](../../prisma/migrations/20261109180000_add_event_publication_status/migration.sql#L1)

- Il modello Prisma rende esplicito il default pubblicato per le nuove creazioni.
  [`schema.prisma:32`](../../prisma/schema.prisma#L32)

- La pagina evento separa la lettura admin dalle query pubbliche e dai suggerimenti.
  [`page.tsx:71`](../../app/events/%5Bslug%5D/page.tsx#L71)

- La lista API non condivide bozze e le serve solo a un admin autenticato.
  [`route.ts:374`](../../app/api/events/route.ts#L374)

- Calendario, preferiti, rassegne e sitemap interrogano soltanto eventi pubblicati.
  [`public-event-list.ts:27`](../../lib/public-event-list.ts#L27)

- Preferiti e indice sitemap applicano la stessa condizione di pubblicazione.
  [`route.ts:10`](../../app/api/favorites/route.ts#L10)
  [`sitemap.ts:37`](../../app/sitemap.ts#L37)

- Le rassegne pubbliche non includono eventi in bozza né nei conteggi.
  [`page.tsx:66`](../../app/rassegne/%5Bslug%5D/page.tsx#L66)
  [`page.tsx:23`](../../app/rassegne/page.tsx#L23)

- Le storie pianificate usano solo eventi pubblicati.
  [`route.ts:531`](../../app/api/cron/generate-instagram-story/route.ts#L531)

- Il service worker evita cache private e pagine evento potenzialmente amministrative.
  [`sw.js:19`](../../public/sw.js#L19)

**Moderation interface**

- I controlli nell’editor gestiscono caricamento, conferma, feedback e aggiornamento dello stato.
  [`page.tsx:326`](../../app/events/%5Bslug%5D/edit/page.tsx#L326)

- L’account richiede draft inclusion per la vista admin e marca le schede.
  [`page.tsx:227`](../../app/account/page.tsx#L227)

- Il badge distingue visivamente le bozze dalla normale lista eventi.
  [`EventPreview.tsx:188`](../../app/components/EventPreview.tsx#L188)

**Contracts and verification**

- La reference descrive autorizzazioni, risposte e pulizia dei file.
  [`API_REFERENCE.md:324`](../../docs/API_REFERENCE.md#L324)

- I test coprono autorizzazione, stato, cancellazione e fallimenti storage/database.
  [`event-moderation-api.test.mjs:108`](../../lib/event-moderation-api.test.mjs#L108)

- I test della lista verificano che solo l’admin possa includere le bozze.
  [`event-list-api.test.mjs:72`](../../lib/event-list-api.test.mjs#L72)

- La pulizia storage riconosce URL del bucket e mantiene al sicuro oggetti condivisi.
  [`supabase.ts:173`](../../app/lib/supabase.ts#L173)

- Il tipo applicativo riflette il flag generato da Prisma.
  [`event.ts:24`](../../app/types/event.ts#L24)
