---
title: 'Raggruppare I miei eventi per origine e data di scansione'
type: 'feature'
created: '2026-09-26'
status: 'done'
baseline_commit: 'cd75e8a4df019a21155b81b8df96b022e9b9a38a'
context: []
---

<frozen-after-approval reason="intento approvato dall'utente">

## Intent

**Problema:** In “I miei eventi” tutte le schede compaiono in una sola griglia, senza distinguere le scansioni dell'utente da quelle automatiche né mostrare quando sono state effettuate.

**Approccio:** Organizzare gli eventi visibili nella sezione in due gruppi, “Scansionati da me” e, se presente, “Scansionati dal cron”. Dentro ciascun gruppo, suddividere per giorno di scansione in ordine decrescente.

## Limiti e vincoli

**Sempre:** Mantenere le regole attuali di visibilità (utente normale: propri eventi; admin: eventi disponibili nella vista amministrativa), la navigazione e la modifica delle schede. Usare `origin === "user"` per gli eventi inseriti dall'utente e gli altri valori di `origin` per il cron, come già fanno i servizi. Usare `createdAt` come data della scansione/salvataggio, non `date` (giorno in cui si svolge l'evento); mostrare date leggibili in italiano.

**Chiedere prima:** Se per “data di scansione” si intende una data diversa dalla creazione dell'evento, oppure se si vogliono cambiare le regole di accesso/visibilità attuali.

**Mai:** Non modificare lo schema del database, la provenienza registrata dai processi di acquisizione o la scheda dei preferiti. Non mostrare contenitori cron vuoti.

## Casi e comportamento

| Scenario | Stato | Comportamento atteso | Errori |
|----------|-------|----------------------|--------|
| Eventi misti | Scansioni utente e cron in più giorni | Due sezioni, ciascuna con intestazioni per giorno e schede raggruppate correttamente; date più recenti prima | N/A |
| Solo utente | Nessun evento cron visibile | Solo la sezione utente | N/A |
| Solo cron | Nessun evento utente visibile | Solo la sezione cron, senza stato vuoto globale | N/A |
| Nessun evento | Elenco vuoto | Conservare lo stato vuoto attuale | N/A |

</frozen-after-approval>

## Mappa del codice

- `app/account/page.tsx` — scheda “I miei eventi”, caricamento dati, schede e vista admin.
- `lib/event-scan-groups.ts` — raggruppamento testabile per provenienza e giorno di scansione.
- `lib/event-scan-groups.test.mjs` — casi misti, singoli e timestamp invalidi.
- `app/api/events/route.ts` — restituisce eventi con `origin` e `createdAt`, ordinati per creazione; la vista admin usa un limite di 200.
- `app/types/event.ts` — tipo `DbEvent`; il JSON serializza `createdAt` come stringa.
- `prisma/schema.prisma` — campi persistiti `origin` e `createdAt`.
- `app/api/admin/event-log/route.ts` — precedente criterio di provenienza (`origin` diverso da `user`).

## Attività e accettazione

**Esecuzione:**
- [x] `app/account/page.tsx` — raggruppare per origine e per giorno di `createdAt`, mantenendo l'ordine più recente e riutilizzando le schede esistenti; rendere corrette le etichette anche per gli eventi cron della vista admin.
- [x] `app/account/page.tsx` — gestire esplicitamente date di creazione non valide senza collocare silenziosamente un evento nel giorno sbagliato.
- [x] Aggiungere test mirati della logica di raggruppamento se il progetto dispone di un runner adatto; altrimenti verificare compilazione e rendering manuale delle combinazioni della matrice.

**Criteri di accettazione:**
- Dati eventi con `date` uguale ma `createdAt` in giorni diversi, quando apro “I miei eventi”, allora compaiono sotto due date di scansione distinte.
- Dato un utente normale, quando apre la sezione, allora non vede eventi di altri utenti aggiunti da questa funzionalità.
- Dato un admin con eventi cron, quando apre la sezione, allora le schede cron non sono etichettate come sue scansioni manuali e mantengono i pulsanti di navigazione/modifica esistenti.

## Registro modifiche spec

## Verifica

**Comandi:**
- `npx eslint app/account/page.tsx` — nessun nuovo errore.
- `npx tsc --noEmit` — tipi validi.
- `node --no-warnings --experimental-strip-types --test lib/event-scan-groups.test.mjs` — tutti i casi di raggruppamento superati.

**Controlli manuali:**
- In un ambiente con dati reali verificare l'aspetto delle due sezioni e delle schede della vista “I miei eventi”.

## Suggested Review Order

**Interfaccia**

- Le sezioni compaiono solo se contengono eventi, con giorni e schede sottostanti.
  [`page.tsx:647`](../../../app/account/page.tsx#L647)

- La vista amministrativa evita di attribuire all'admin le scansioni degli utenti.
  [`page.tsx:113`](../../../app/account/page.tsx#L113)

**Raggruppamento**

- Origine, giorno romano e ordinamento discendente sono calcolati senza cambiare i dati persistiti.
  [`event-scan-groups.ts:42`](../../../lib/event-scan-groups.ts#L42)

- Il giorno è ricavato da `createdAt` nel fuso Europe/Rome.
  [`event-scan-groups.ts:34`](../../../lib/event-scan-groups.ts#L34)

**Verifica**

- I test coprono origini miste, date diverse, insiemi vuoti e timestamp invalidi.
  [`event-scan-groups.test.mjs:7`](../../../lib/event-scan-groups.test.mjs#L7)
