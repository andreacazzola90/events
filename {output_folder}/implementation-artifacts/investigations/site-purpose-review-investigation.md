# Investigation: Capire lo scopo del sito e individuare opportunità

## Hand-off Brief

1. **Cosa emerge.** EventScanner aiuta a scoprire eventi nell'Alto Vicentino e a raccoglierli da locandine e link per pubblicarli.
2. **Stato del caso.** Concluso per la comprensione iniziale; sono emersi punti UX verificabili e opportunità che richiedono dati d'uso.
3. **Prossima azione.** Validare prima la coerenza del calendario, l'accesso ai preferiti e il flusso di consenso analytics, poi dare priorità con metriche e feedback.

## Case Info

| Field            | Value |
| ---------------- | ----- |
| Ticket           | N/A |
| Date opened      | 2026-11-08 |
| Status           | Concluded |
| System           | Next.js website, local repository |
| Evidence sources | `app/page.tsx`, `docs/PROJECT_OVERVIEW.md`, `README.md` |

## Problem Statement

L'utente chiede: "comprendi gli scopi di questo sito? che miglioramenti posso fare?" Non segnala un difetto specifico; la richiesta è esplorativa e riguarda scopo e opportunità del sito.

## Evidence Inventory

| Source | Status | Notes |
| ------ | ------ | ----- |
| Homepage | Available | `app/page.tsx` presenta il servizio, le aree servite, l'esplorazione, la mappa, il calendario e la creazione di eventi. |
| Project overview | Available | `docs/PROJECT_OVERVIEW.md` descrive obiettivo, funzionalità, flussi e pagine principali. |
| README | Available | Conferma linguaggio visuale e alcuni vincoli di caricamento e navigazione mobile. |
| User research and analytics | Missing | Necessari per stimare bisogni reali, frizioni e impatto delle opportunità. |

## Investigation Backlog

| # | Path to Explore | Priority | Status | Notes |
| - | --------------- | -------- | ------ | ----- |
| 1 | Mappare i flussi delle principali pagine pubbliche e i loro punti di ingresso/uscita | High | Open | Verificare che scoperta, consultazione e contribuzione formino un percorso coerente. |
| 2 | Confrontare le promesse della homepage con dati di copertura, aggiornamento e qualità degli eventi | Medium | Open | Richiede ispezione delle pagine e delle fonti dati. |
| 3 | Verificare analytics, feedback utenti e prestazioni osservate | Medium | Open | La documentazione disponibile non prova bisogni o frizioni reali. |

## Timeline of Events

| Time | Event | Source | Confidence |
| ---- | ----- | ------ | ---------- |
| 2026-11-08 | La homepage posiziona il sito sugli eventi di Schio e Alto Vicentino e offre esplorazione, mappa e creazione evento. | `app/page.tsx:10`, `app/page.tsx:35`, `app/page.tsx:55`, `app/page.tsx:98` | Confirmed |
| 2026-11-08 | L'overview descrive raccolta, creazione, ricerca e pubblicazione di eventi locali, anche da immagini e link. | `docs/PROJECT_OVERVIEW.md:7` | Confirmed |

## Confirmed Findings

### Finding 1: Il prodotto unisce scoperta locale e raccolta di eventi

**Evidence:** `docs/PROJECT_OVERVIEW.md:7`; `app/page.tsx:10`, `app/page.tsx:35`, `app/page.tsx:55`, `app/page.tsx:98`

**Detail:** L'overview definisce il prodotto come strumento per raccogliere, creare, cercare e pubblicare eventi locali. La homepage invita a esplorare gli eventi, aprire la mappa e contribuire creando un evento.

## Deduced Conclusions

### Deduction 1: Il servizio ha una doppia audience

**Based on:** Finding 1.

**Reasoning:** La scoperta degli eventi serve a chi partecipa; la creazione e la raccolta servono a organizzatori o contributori.

**Conclusion:** La chiarezza del valore per entrambi i gruppi è un asse utile per valutare i miglioramenti, ma non è ancora provato che la homepage li distingua con sufficiente efficacia.

## Hypothesized Paths

### Hypothesis 1: La priorità di miglioramento è ridurre l'attrito nel trovare un evento rilevante

**Status:** Open

**Theory:** Filtri, copertura geografica, freschezza e informazioni pratiche potrebbero incidere sulla capacità di trovare un evento adatto.

**Supporting indicators:** La homepage privilegia l'esplorazione e una selezione aggiornata giornalmente.

**Would confirm:** Dati di utilizzo dei filtri, ricerche senza risultati, abbandono e interviste agli utenti.

**Would refute:** Evidenze che gli utenti trovino già rapidamente eventi rilevanti e che il problema principale sia altrove.

**Resolution:** In attesa della mappatura dei flussi e di dati sull'uso reale.

## Missing Evidence

| Gap | Impact | How to Obtain |
| --- | ------ | ------------- |
| Bisogni e frizioni di partecipanti e organizzatori | Impedisce di ordinare le opportunità in base al valore reale | Interviste brevi, feedback in prodotto e test di usabilità |
| Metriche su ricerca, dettaglio evento, mappe e invio eventi | Impedisce di identificare i colli di bottiglia | Analytics con eventi e funnel, nel rispetto della privacy |
| Qualità e copertura delle fonti eventi per area e categoria | Impedisce di valutare completezza e affidabilità percepite | Analisi dei dati e audit delle fonti |

## Source Code Trace

| Element | Detail |
| ------- | ------ |
| Error origin | N/A — esplorazione di prodotto, non diagnosi di un difetto |
| Trigger | Richiesta di capire lo scopo del sito e possibili miglioramenti |
| Condition | Evidenza iniziale da homepage e overview del progetto |
| Related files | `app/page.tsx`, `docs/PROJECT_OVERVIEW.md`, `README.md` |

## Conclusion

**Confidence:** Medium

Le fonti confermano che EventScanner punta a far scoprire eventi nell'Alto Vicentino e a semplificarne raccolta e pubblicazione. La distinzione tra partecipanti e organizzatori è dedotta dalle funzionalità; la priorità dei miglioramenti resta ipotetica senza osservazioni d'uso e copertura dati.

## Recommended Next Steps

### Fix direction

Nessun intervento è giustificato ancora. Prima completare la mappa dei flussi e verificare la qualità delle informazioni; poi ordinare le opportunità sulla base di impatto e prove.

### Diagnostic

Esaminare le pagine pubbliche principali, verificare gli stati vuoti e le informazioni dei dettagli evento, e individuare le metriche già raccolte.

## Reproduction Plan

N/A — caso esplorativo. Piano di verifica: percorrere come partecipante il flusso dalla homepage al dettaglio di un evento; percorrere come organizzatore il flusso di invio; confrontare gli esiti con metriche e feedback disponibili.

## Side Findings

- Il README documenta attenzione a prestazioni iniziali, preferenze di movimento ridotto e navigazione mobile; verificare l'esperienza effettiva nelle pagine principali prima di segnalare problemi.

## Follow-up: 2026-11-08

### New Evidence

| Source | Status | Notes |
| ------ | ------ | ----- |
| Pagine pubbliche e componenti collegati | Available | Le verifiche hanno mappato lista, calendario, mappa, scheda evento e invio. |
| Documentazione analytics e implementazione | Partial | `ANALYTICS_SETUP.md:140` indica il consenso cookie come da implementare; gli script analytics sono montati dal layout globale (`app/layout.tsx:128-129`). La configurazione effettiva del consenso non è stata verificata. |
| Dati d'uso analytics | Missing | È documentato il tracciamento di page view, ricerche e azioni evento, ma non sono stati esaminati dati GA4 o GTM. |

### Additional Findings

#### Finding 2: I percorsi principali coprono scoperta e contribuzione

**Evidence:** `app/eventi/page.tsx:14`, `app/eventi/page.tsx:20`; `app/tutti-gli-eventi/page.tsx:17`, `app/tutti-gli-eventi/page.tsx:225`; `app/components/EventMap.tsx:597`, `app/components/EventMap.tsx:684`; `app/events/[slug]/page.tsx:214`, `app/events/[slug]/page.tsx:273`; `app/crea/page.tsx:827`, `app/crea/page.tsx:870`, `app/crea/page.tsx:888`, `app/crea/page.tsx:1025`

**Detail:** Lista, calendario e mappa consentono di trovare eventi e aprirne le schede. La scheda espone dettagli, luogo e fonte; il flusso di creazione importa da locandina o link, consente revisione e pubblicazione.

#### Finding 3: Opportunità UX osservate nei flussi

**Evidence:** `app/tutti-gli-eventi/page.tsx:243`; `app/events/[slug]/page.tsx:198`; `app/mappa/page.tsx:27`; `app/tutti-gli-eventi/page.tsx:229`

**Detail:** L'ispezione del calendario segnala una discrepanza da chiarire tra navigazione verso periodi precedenti e disponibilità di eventi passati. Nella scheda, il controllo dei preferiti appare condizionato alla presenza dell'immagine. Il fallback della mappa etichetta "Tutti gli eventi" ma punta alla lista `/eventi`. Il pulsante "Oggi" aggiorna la data di ancoraggio senza cambiare la vista selezionata: può essere intenzionale, ma merita un controllo di comprensibilità.

#### Finding 4: Stato del consenso analytics da verificare

**Evidence:** `ANALYTICS_SETUP.md:140`; `app/layout.tsx:128-129`

**Detail:** La guida definisce il cookie consent come ancora da implementare, mentre Google Analytics e Tag Manager vengono montati nel layout condiviso. Questo non prova da solo un problema di conformità o l'assenza di un meccanismo altrove; richiede una verifica del comportamento effettivo prima di trarre conclusioni.

### Updated Hypotheses

#### Hypothesis 1: La priorità di miglioramento è ridurre l'attrito nel trovare un evento rilevante

**Status:** Open

**Resolution:** La mappa dei flussi conferma che esistono più strumenti di scoperta, ma non rivela quale sia più usato né dove gli utenti abbandonino. Servono dati o test con utenti per confermare la priorità.

#### Hypothesis 2: Gli eventi passati non sono consultabili in modo coerente dal calendario

**Status:** Open

**Theory:** La navigazione ai periodi precedenti può non corrispondere ai giorni e agli eventi resi disponibili nella vista mensile.

**Supporting indicators:** L'ispezione rileva giorni passati disabilitati nella vista mensile mentre la navigazione temporale permette di andare indietro.

**Would confirm:** Definire il comportamento di prodotto atteso e verificare insieme UI e dati per periodi precedenti con esempi di eventi.

**Would refute:** Confermare che il calendario sia deliberatamente limitato agli eventi futuri e rendere questa regola chiara nell'interfaccia.

**Resolution:** Nessuna verifica con utenti o controllo della copertura dati ancora eseguito.

### Backlog Changes

| # | Path to Explore | Priority | Status | Notes |
| - | --------------- | -------- | ------ | ----- |
| 1 | Mappare i flussi delle principali pagine pubbliche e i loro punti di ingresso/uscita | High | Done | Mappati lista, calendario, mappa, scheda e invio. |
| 2 | Confrontare le promesse della homepage con dati di copertura, aggiornamento e qualità degli eventi | Medium | Open | Restano da analizzare copertura e qualità effettive. |
| 3 | Verificare analytics, feedback utenti e prestazioni osservate | Medium | Open | La documentazione analytics indica il consenso come da implementare; la raccolta effettiva e il consenso vanno verificati. |
| 4 | Chiarire calendario passato, preferiti senza immagine e destinazione del fallback mappa | Medium | Open | Punti circoscritti osservati nei flussi; priorità e comportamento atteso da confermare. |

### Updated Conclusion

**Confidence:** Medium

I percorsi principali sono coerenti con il duplice obiettivo di scoprire eventi e contribuire alla loro pubblicazione. Le opportunità puntuali riguardano coerenza del calendario passato, accessibilità dei preferiti e chiarezza della navigazione di fallback. La guida segnala il consenso analytics come da implementare, ma occorre verificare il comportamento effettivo; senza dati d'uso o test non è possibile stimare l'impatto quantitativo.

### Fix direction

1. **Prima priorità — chiarire il comportamento del calendario.** Verificare che gli eventi passati siano esclusi per scelta; se sì, rendere chiaro il limite e valutare se impedire la navigazione a ritroso. Se devono essere consultabili, correggere la discrepanza. Evidenza osservata, impatto da validare.
2. **Seconda priorità — rendere i preferiti indipendenti dall'immagine.** Mostrare l'azione di salvataggio anche per eventi senza immagine, se la funzione è disponibile per tutti gli eventi. Evidenza osservata, impatto da validare.
3. **Terza priorità — allineare etichetta e destinazione del fallback mappa.** Confermare se "Tutti gli eventi" debba aprire il calendario o la lista e rendere coerenti testo e link. Basso rischio, correzione semplice dopo conferma dell'intento.
4. **Priorità trasversale — verificare consenso e misurazione analytics.** Controllare che GA/GTM rispettino il consenso richiesto prima del caricamento e che i funnel utili siano misurabili; la documentazione dichiara il consenso ancora da implementare, non è stata svolta una verifica legale o di runtime.
5. **Dopo — ottimizzare ricerca e invio sulla base dei dati.** Misurare ricerche senza risultati e passaggi ricerca → dettaglio → azione, oltre ad avvio invio → revisione → pubblicazione; usare test utenti prima di aggiungere filtri o cambiare il flusso.

### Diagnostic

Riprodurre le condizioni limite per calendario e preferiti; confermare il target del fallback mappa. Verificare runtime e configurazione del consenso con chi gestisce analytics. Per la priorità successiva raccogliere analytics privacy-aware e feedback di partecipanti e organizzatori.

### Reproduction Plan

N/A — caso esplorativo. Per la verifica: aprire il calendario su periodi passati, confrontare con la lista; aprire una scheda evento priva d'immagine e cercare l'azione preferiti; dalla mappa seguire il link del fallback e confrontare la pagina con la sua etichetta.
