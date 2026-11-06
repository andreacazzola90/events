---
title: 'Rendere il sito più snello e coinvolgente'
type: 'feature'
created: '2026-11-06'
status: 'done'
baseline_commit: 'c7ef2b13cd67b58cc204bf7ba52abbb1da971ff6'
context: []
---

<frozen-after-approval reason="Richiesta dell'utente">

## Intent

**Problem:** L'interfaccia usa regole e componenti non sempre coerenti, ha caricamenti rappresentati con spinner diversi e include dichiarazioni CSS ripetute. Questo rende l'esperienza meno riconoscibile e aggiunge rumore visivo proprio quando l'utente aspetta un risultato.

**Approach:** Alleggerire e ringiovanire la presentazione in tutte le aree del sito, mantenendo palette e identità EventScanner ma rendendo più chiari gerarchie, spazi e azioni. Uniformare i feedback di caricamento con animazioni brevi e accessibili, e rimuovere duplicazioni di markup/stili solo dove sono effettive.

## Boundaries & Constraints

**Always:** Applicare il refresh alle pagine pubbliche, di autenticazione, account e gestione eventi senza alterare flussi, dati, link, permessi o API. Rispettare la guida UI/UX esistente, contrasto, tastiera, target touch e `prefers-reduced-motion`. Mantenere distinti caricamento, assenza di risultati ed errore; per scansioni lunghe preservare messaggi e animazione contestuali. Rimuovere solo duplicazioni verificabili, senza cancellare varianti intenzionali.

**Ask First:** Cambiare identità del marchio, introdurre nuove dipendenze, modificare contenuti o comportamento, oppure rimuovere funzionalità.

**Never:** Animazioni infinite o lampeggianti per attendere richieste, sostituire un messaggio di errore con un successo fittizio, appiattire gli stati operativi dell'amministrazione, o rifattorizzare codice non collegato alla coerenza visiva.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Attesa breve | Lista, mappa, autenticazione o azione in corso | Feedback coerente, visibile e non bloccante; contenuto annuncio accessibile | Nessuna falsa indicazione di completamento |
| Elaborazione lunga | Scansione immagine, PDF o link | Animazione e messaggio contestuali già previsti rimangono comprensibili | Errore e possibilità di recupero restano visibili |
| Movimento ridotto | `prefers-reduced-motion: reduce` | Nessun moto decorativo continuo; indicatore statico con stato testuale | Nessun feedback basato solo sul movimento |
| Fine o errore | Richiesta terminata o fallita | Il loader scompare e lascia spazio allo stato corretto | Errore distinto da lista vuota |
| CSS duplicato | Regole equivalenti senza differenze intenzionali | Regola condivisa unica | Conservare esplicitamente qualsiasi override necessario |

</frozen-after-approval>

## Code Map

- `app/globals.css` — token, componenti condivisi, regole responsive e animazioni; include più definizioni `.btn`.
- `app/ui-ux/page.tsx` — guida visibile al sistema di design, da mantenere allineata ai token effettivi.
- `app/components/LoadingAnimation.tsx` e `app/components/LoadingIndicator.tsx` — feedback di elaborazione e transizione condivisi.
- `app/components/EventList.tsx` e `app/components/EventMap.tsx` — caricamenti delle principali viste di scoperta.
- `app/auth/page.tsx`, `app/auth/signout/page.tsx`, `app/account/page.tsx` — caricamenti e operazioni d'accesso/account.
- `app/crea/page.tsx`, `app/components/ImageUploader.tsx`, `app/components/EventDisplay.tsx` — scansioni e azioni sugli eventi.
- `app/components/SiteFeedbackWidget.tsx` e `app/admin/` — feedback e stati asincroni aggiuntivi.

## Tasks & Acceptance

**Execution:**
- [x] `app/globals.css` — semplificare e armonizzare token e regole condivise per rendere più leggeri superfici, tipografia, spazi e azioni senza rompere le varianti di pagina.
- [x] `app/components/LoadingAnimation.tsx`, `app/components/LoadingIndicator.tsx` e i componenti con loader — applicare un feedback coerente, breve, testuale e compatibile con movimento ridotto; mantenere l'animazione di scansione specifica.
- [x] `app/globals.css` e componenti toccati — eliminare dichiarazioni o blocchi visivi realmente duplicati e mantenere le varianti intenzionali.
- [x] `app/ui-ux/page.tsx` — aggiornare la guida se cambiano token o regole.
- [x] Verificare le rotte rappresentative su desktop/mobile, tutti gli stati di attesa modificati, gli errori e il movimento ridotto.

**Acceptance Criteria:**
- Given una pagina pubblica, autenticazione, account o gestione eventi, when viene visualizzata a 390 px e 1280 px, then contenuti e azioni principali restano leggibili, raggiungibili e senza overflow.
- Given un caricamento breve o prolungato, when è attivo, then l'utente vede un'indicazione coerente e contestuale senza perdere contenuto, messaggi o controlli necessari.
- Given `prefers-reduced-motion: reduce`, when compare un loader, then l'indicazione resta comprensibile senza animazioni continue.
- Given una richiesta fallita o senza risultati, when termina il caricamento, then errore e stato vuoto non vengono confusi.
- Given regole CSS o markup duplicati, when vengono consolidati, then nessuna variante visiva intenzionale o comportamento preesistente cambia.
- Given la guida `/ui-ux`, when il refresh è completato, then token e principi documentati corrispondono ai componenti condivisi effettivi.

## Verification

**Commands:**
- `npx eslint app/components/LoadingAnimation.tsx app/components/LoadingIndicator.tsx app/components/EventList.tsx app/components/EventMap.tsx app/auth/page.tsx app/auth/signout/page.tsx app/account/page.tsx app/crea/page.tsx app/components/ImageUploader.tsx app/components/EventDisplay.tsx app/components/SiteFeedbackWidget.tsx app/ui-ux/page.tsx` — expected: nessun errore nei file modificati.
- `npm run build` — expected: build Next.js completata.

**Manual checks:**
- Verificare viewport 390 px e 1280 px, `prefers-reduced-motion: reduce` e stati caricamento/vuoto/errore su pagine rappresentative.

**Risultati:** ESLint mirato, `npm run build` e `git diff --check` superati. Browser verificato a 390/1280 px senza overflow sulle rotte rappresentative; controllati caricamento/vuoto/errore della mappa e movimento ridotto. Le viste autenticate account e amministrazione non sono state controllate nel browser senza sessione.

## Suggested Review Order

**Sistema visivo condiviso**

- Token, pulsanti e superfici unificati senza cambiare l’identità EventScanner.
  [`globals.css:3`](../../app/globals.css#L3)

- Carte evento e intestazioni alleggerite con gerarchia e feedback più chiari.
  [`globals.css:1114`](../../app/globals.css#L1114)

**Attese e accessibilità**

- Loader riutilizzabile con messaggio contestuale e annuncio accessibile.
  [`LoadingAnimation.tsx:38`](../../app/components/LoadingAnimation.tsx#L38)

- Elenco e mappa condividono lo stesso stato di caricamento senza confondere vuoto ed errore.
  [`EventList.tsx:499`](../../app/components/EventList.tsx#L499)

- Animazione lunga della scansione preservata e ridotta quando richiesto.
  [`globals.css:2374`](../../app/globals.css#L2374)

**Flussi e documentazione**

- Errori di caricamento account esposti con azione di nuovo tentativo.
  [`account/page.tsx:939`](../../app/account/page.tsx#L939)

- Guida aggiornata per palette, superfici e motion accessibile.
  [`ui-ux/page.tsx:136`](../../app/ui-ux/page.tsx#L136)
