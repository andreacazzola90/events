---
title: 'Geocodifica degli eventi esistenti'
type: 'feature'
created: '2026-11-20'
status: 'done'
baseline_commit: 'ed3a2b59c26a3919d9350e8f4af2c0167cfa9639'
context:
  - '/CONTEXT.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Alcuni eventi pubblici hanno un luogo testuale ma non coordinate; la mappa li esclude. Inoltre la mappa chiede solo i 20 eventi più recentemente creati, mentre il calendario ne carica fino a 500.

**Approach:** Recuperare in modo controllato le coordinate mancanti degli eventi pubblici già salvati e fare usare alla mappa lo stesso insieme di eventi del calendario. Riutilizzare la geocodifica esistente anche per i nuovi eventi.

## Boundaries & Constraints

**Always:** Processare solo eventi pubblici con coordinate mancanti o non valide. Preferire il risultato preciso del luogo; usare il centro della località solo quando il geocoder la verifica. Aggiornare in modo condizionale per non sovrascrivere modifiche concorrenti. Nel backfill, distanziare di almeno un secondo ogni richiesta al geocoder.

**Ask First:** Includere eventi non pubblicati, usare un provider esterno diverso o assegnare coordinate approssimative senza una località verificata.

**Never:** Geocodificare dal browser, sovrascrivere coordinate valide o inventare coordinate quando il luogo è ambiguo/non trovato.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Luogo geocodificabile | Evento pubblico senza coordinate valide | Salvare latitudine/longitudine e rendere l'evento idoneo alla mappa | Aggiornamento condizionale; registrare l'esito senza esporre dati sensibili |
| Luogo non risolto o segnaposto | Geocoder senza risultato valido | Lasciare le coordinate nulle e conteggiare l'evento come non risolto | Non bloccare gli altri eventi |
| Record modificato durante la ricerca | Coordinate o luogo cambiati dopo la lettura | Non sovrascrivere i dati più recenti | Saltare l'aggiornamento concorrente |
| Esecuzione senza opzione di applicazione | Avvio dello strumento di backfill | Mostrare quanti record sono candidati senza richieste esterne né scritture | Uscita esplicita e senza modifiche |

</frozen-after-approval>

## Code Map

- `app/components/EventMap.tsx` -- caricamento eventi e filtro che richiede coordinate valide.
- `app/api/events/route.ts` -- API pubblica; geocodifica già i nuovi eventi in background.
- `app/lib/geocoding.ts` -- geocoder attualmente usato dalle route applicative.
- `lib/geocoding.ts` -- geocoder condiviso con controllo della località e test esistenti.
- `lib/map-event-date-filter.ts` -- filtro data della mappa, mantenuto verificabile indipendentemente dal rendering Leaflet.
- `prisma/schema.prisma` -- latitudine e longitudine nullable sul modello Event.

## Tasks & Acceptance

**Execution:**
- [x] `app/components/EventMap.tsx` -- richiedere fino a 500 eventi includendo anche i passati, come il calendario, e lasciare al filtro client la scelta degli eventi futuri.
- [x] `app/lib/geocoding.ts`, `lib/geocoding.ts` -- riusare il geocoder con località verificata e serializzare le richieste Nominatim del backfill, con almeno un secondo tra richieste.
- [x] `lib/event-coordinate-backfill.ts`, `scripts/backfill-event-coordinates.mjs`, `package.json` -- aggiungere un backfill seriale per gli eventi pubblici senza coordinate valide; default dry-run, scrittura solo con `--apply`, aggiornamento condizionale, pulizia dei componenti non validi, avanzamento e ID degli irrisolti.
- [x] `lib/geocoding.test.mjs`, `lib/event-coordinate-backfill.test.mjs`, test API/mappa pertinenti -- coprire località non risolte, dry-run, aggiornamenti concorrenti e richiesta completa della mappa.
- [x] `lib/map-event-date-filter.ts`, `lib/map-event-date-filter.test.mjs` -- verificare che il filtro locale continui a escludere gli eventi passati dopo il caricamento esteso.

**Acceptance Criteria:**
- Given eventi presenti nel calendario ma non nei primi 20 creati, when la mappa si carica, then riceve fino a 500 eventi e applica il proprio filtro data.
- Given un evento pubblico con luogo risolvibile e coordinate mancanti, when il backfill è eseguito con `--apply`, then persiste coordinate valide senza sostituire dati aggiornati da altri processi.
- Given un luogo ambiguo o non geocodificabile, when il backfill lo elabora, then non inventa coordinate e continua con gli altri eventi.
- Given il backfill senza `--apply`, when viene avviato, then non contatta il geocoder e non modifica il database.

## Verification

**Commands:**
- `node --test lib/geocoding.test.mjs lib/event-coordinate-backfill.test.mjs lib/map-event-date-filter.test.mjs lib/event-create-api.test.mjs lib/event-list-api.test.mjs` -- tutti i test mirati superano.
- `npx eslint app/components/EventMap.tsx app/lib/geocoding.ts lib/geocoding.ts lib/event-coordinate-backfill.ts lib/map-event-date-filter.ts scripts/backfill-event-coordinates.mjs` -- nessun errore sui file modificati.
- `npx tsc --noEmit` -- nessun errore di tipi.

## Suggested Review Order

**Dataset della mappa**

- Punto d’ingresso: la mappa carica lo stesso insieme del calendario, poi applica i filtri locali.
  [`EventMap.tsx:193`](../../app/components/EventMap.tsx#L193)

- Il filtro conserva il comportamento per oggi, prossimi giorni e intervalli personalizzati.
  [`map-event-date-filter.ts:31`](../../lib/map-event-date-filter.ts#L31)

**Backfill controllato**

- Il backfill seleziona solo eventi pubblici e parte senza richieste esterne o scritture.
  [`event-coordinate-backfill.ts:89`](../../lib/event-coordinate-backfill.ts#L89)

- Gli aggiornamenti condizionali preservano componenti validi e rifiutano record modificati in parallelo.
  [`event-coordinate-backfill.ts:170`](../../lib/event-coordinate-backfill.ts#L170)

- Le coordinate fuori intervallo vengono pulite solo se il record non è cambiato.
  [`event-coordinate-backfill.ts:135`](../../lib/event-coordinate-backfill.ts#L135)

- Il pacer separa le richieste Nominatim durante l’esecuzione autorizzata.
  [`event-coordinate-backfill.ts:73`](../../lib/event-coordinate-backfill.ts#L73)

**Geocodifica condivisa**

- Le route riusano il geocoder che verifica la località prima di restituire coordinate.
  [`geocoding.ts:1`](../../app/lib/geocoding.ts#L1)

- Il budget più ampio consente il fallback di località dopo la pausa Nominatim.
  [`geocoding.ts:118`](../../lib/geocoding.ts#L118)

**Verifiche**

- I test coprono dry-run, aggiornamenti concorrenti, coordinate parziali e pacing.
  [`event-coordinate-backfill.test.mjs:35`](../../lib/event-coordinate-backfill.test.mjs#L35)

- La richiesta della mappa e il filtro data restano coperti da test mirati.
  [`event-list-api.test.mjs:95`](../../lib/event-list-api.test.mjs#L95)

- L’operatore deve passare esplicitamente `--apply` per iniziare il backfill.
  [`backfill-event-coordinates.mjs:8`](../../scripts/backfill-event-coordinates.mjs#L8)
