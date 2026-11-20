---
title: 'Completamento dei dati strutturati degli eventi'
type: 'feature'
created: '2026-11-20'
status: 'in-review'
baseline_commit: 'dfea31e7987cdd160a05e572741f673207f59584'
context:
  - '{project-root}/{output_folder}/planning-artifacts/architecture.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** I dati Schema.org degli eventi non comprendono tutte le informazioni utili a Google per riconoscere date, performer, organizzatore, luogo e biglietti. Alcuni campi sono già nel JSON-LD ma non sono modificabili o rappresentati nella forma necessaria.

**Approach:** Aggiungere campi opzionali agli eventi e renderli compilabili in creazione e modifica. Generare JSON-LD usando soltanto valori reali inseriti, senza inventare date, prezzi, indirizzi, performer o disponibilità.

## Boundaries & Constraints

**Always:** I dati esistenti restano leggibili e pubblicabili; i nuovi campi sono nullable o hanno un default semanticamente corretto. Validare URL HTTP(S), date e disponibilità. Il markup deve omettere i valori assenti e serializzare correttamente `endDate`, `performer`, `organizer.url`, `offers.url`, `offers.availability`, `offers.validFrom` e `location.address`; mantenere `eventStatus` e `organizer` coerenti con i dati salvati.

**Ask First:** Nessuna decisione aggiuntiva prevista.

**Never:** Non dedurre date di fine o validità, performer, indirizzi, prezzi, link di vendita o stato evento da titolo, orario, organizzatore o testo libero. Non impostare disponibilità o prezzo predefiniti.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Campi SEO compilati | Evento con date, indirizzo, performer, URL e dati biglietti validi | Salvataggio e proprietà corrispondenti nel JSON-LD | N/A |
| Campi SEO vuoti | Evento storico senza nuovi valori | Salvataggio invariato; proprietà opzionali omesse | N/A |
| Dati non validi | URL non HTTP(S), data impossibile o disponibilità non ammessa | Nessun valore non valido nel DB o nel JSON-LD | Risposta di validazione esplicita |

</frozen-after-approval>

## Code Map

- `prisma/schema.prisma` -- modello Event e campi SEO opzionali.
- `app/api/events/route.ts` -- persistenza alla creazione; `app/api/events/[id]/route.ts` -- aggiornamento e validazione.
- `app/components/EventDisplay.tsx` -- revisione dei dati prima della creazione.
- `app/events/[slug]/edit/page.tsx` -- modifica dei campi degli eventi esistenti.
- `app/types/event.ts` -- tipi condivisi degli eventi.
- `lib/event-seo.ts` -- costruzione del JSON-LD Event.
- `lib/event-seo.test.mjs` -- test di serializzazione JSON-LD.

## Tasks & Acceptance

**Execution:**
- [x] `prisma/schema.prisma` e nuova migration -- aggiungere campi opzionali per data/ora di fine, indirizzo completo, performer e tipo, URL organizzatore, URL/disponibilità/validità dell’offerta, e stato evento con default Scheduled -- conservare i record esistenti senza backfill inventato.
- [x] `app/types/event.ts`, `app/api/events/route.ts`, `app/api/events/[id]/route.ts` -- tipizzare, validare e persistere i nuovi campi in creazione e aggiornamento.
- [x] `app/components/EventDisplay.tsx` e `app/events/[slug]/edit/page.tsx` -- esporre campi opzionali accessibili e coerenti con i valori salvati.
- [x] `lib/event-seo.ts` e `lib/event-seo.test.mjs` -- mappare i valori reali nelle proprietà Schema.org e coprire omissione e input non validi.

**Acceptance Criteria:**
- Given un evento creato o modificato con i nuovi dati validi, when si salva e si apre la pagina pubblica, then i valori persistono e il JSON-LD li rappresenta nei rispettivi campi Schema.org.
- Given un evento senza informazioni facoltative, when viene salvato o pubblicato, then nessun valore viene dedotto e i campi non disponibili restano omessi.
- Given dati con URL o date non validi, when si tenta il salvataggio, then l’API segnala la validazione e non pubblica dati strutturati malformati.
- Given eventi già presenti nel database, when viene applicata la migration, then restano leggibili con i valori opzionali vuoti e lo stato Scheduled.

## Spec Change Log

## Design Notes

Il markup non può garantire risultati avanzati per eventi privi di dati facoltativi: la priorità è la correttezza semantica. Lo stato predefinito Scheduled mantiene l’attuale comportamento; gli altri stati ammessi devono essere mappati a URL `https://schema.org/Event...`.

## Verification

**Commands:**
- `node --test lib/event-seo.test.mjs` -- test mirati JSON-LD superati.
- `npx tsc --noEmit` -- nessun errore di tipo.
- `npx prisma validate` -- schema Prisma valido.
