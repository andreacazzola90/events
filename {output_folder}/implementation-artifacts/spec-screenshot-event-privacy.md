---
title: 'Protezione dei dati personali negli screenshot degli eventi'
type: 'feature'
created: '2026-10-18'
status: 'done'
baseline_commit: '983c5e0e1f682c775150c81280aaa09d70813fbd'
context: []
---

<frozen-after-approval reason="human-owned intent">

## Intent

**Problem:** Le immagini inviate possono essere screenshot di telefono o PC, inclusi stati WhatsApp e storie Instagram. Il ritaglio esistente individua una locandina, ma non certifica l'esclusione dei dati personali; se il riconoscimento fallisce, il client riutilizza lo screenshot originale come copertina. Nomi di contatti, avatar, notifiche, messaggi e foto personali possono quindi essere pubblicati insieme all'evento.

**Approach:** Integrare una valutazione esplicita della privacy nel riconoscimento della locandina e verificare il risultato ritagliato prima di renderlo utilizzabile. Conservare soltanto l'immagine dell'evento, senza elementi personali dell'interfaccia circostante. Se non e possibile ottenere un'immagine verificata, interrompere l'elaborazione con un errore comprensibile che chieda un ritaglio manuale e un nuovo invio, senza ripiegare sull'originale.

## Boundaries & Constraints

**Always:** Applicare il controllo agli upload di immagini e alle immagini condivise tramite il percorso esistente. Conservare intatte le fotografie degli artisti e dei relatori che fanno parte della locandina: non oscurarle e non eliminarle. Eliminare dal risultato tramite ritaglio le foto profilo, gli avatar e le immagini personali dell'utente che ha pubblicato lo stato o la storia, riconoscendone il ruolo dal contesto dell'interfaccia e non dall'identita della persona. Conservare organizzatori, loghi e contatti pubblicitari intenzionalmente presenti nella locandina. Escludere nomi utente, chat, notifiche, barre di stato e controlli social. Trattare risposte AI assenti, incomplete, malformate o incerte come controllo non superato. Usare Sharp e i provider vision gia disponibili. Dichiarare che il riconoscimento AI riduce il rischio, ma non garantisce l'assenza assoluta di dati personali.

**Ask First:** Estendere la protezione a PDF, immagini acquisite da siti e cron, immagini gia pubblicate o altri percorsi non coperti dall'API di upload; aggiungere servizi esterni; introdurre conservazione di originali o oscuramento automatico al posto del ritaglio.

**Never:** Pubblicare lo screenshot originale come ripiego dopo un controllo incerto o fallito. Oscurare o eliminare le immagini degli artisti appartenenti alla locandina per rimuovere l'avatar di chi ha pubblicato. Rimuovere indiscriminatamente tutte le persone presenti sulla locandina. Identificare persone, fare riconoscimento facciale, inventare parti mancanti del poster o ricostruire testo coperto. Presentare questa modifica come anonimizzazione certificata. Modificare lo schema del database o ridisegnare la pagina di creazione.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Stato WhatsApp | Locandina con nome contatto, avatar e barra risposte esterni | Solo locandina, senza elementi personali | Se il rettangolo sicuro non esiste, richiesta di ritaglio manuale |
| Storia Instagram | Poster con account e controlli sovrapposti o esterni | Ritaglio solo se conserva l'evento senza dati personali estranei | Sovrapposizione non eliminabile: nessuna copertina restituita |
| Screenshot PC | Browser o desktop con notifiche, schede e altre finestre | Conservare esclusivamente l'immagine dell'evento | Se ambiguo o con piu locandine, chiedere un'immagine isolata |
| Locandina originale | Intera immagine pertinente all'evento | Immagine utilizzabile anche con artisti e contatti pubblici | Non confondere contenuti editoriali con foto profilo |
| Artista e autore del post | Foto dell'artista nella locandina e avatar dell'utente nell'interfaccia social | Artista conservato intatto; avatar dell'utente escluso dal ritaglio | Se non separabili senza danneggiare la locandina, chiedere un'immagine gia ritagliata, senza oscurare l'artista |
| Dati rimasti nel ritaglio | Prima analisi incompleta | Verifica del risultato respinta, nessun originale di ripiego | Errore applicativo recuperabile |
| Vision indisponibile | Timeout, output incompleto o nessuna valutazione | Nessuna immagine approvata | Errore esplicito; non considerare l'OCR equivalente al controllo visivo |
| Coordinate errate | Bounding box non valida, troppo piccola o fuori immagine | Nessun ritaglio approvato | Validazione deterministica e richiesta di nuovo invio |

</frozen-after-approval>

## Code Map

- `app/api/process-image/route.ts`: esegue OCR e vision in parallelo, richiede POSTER_BOUNDS e restituisce previewImageDataUrl; controlla il percorso di analisi e gli errori.
- `lib/poster-crop.ts`: valida i bounds normalizzati e produce il JPEG con Sharp; attualmente restituisce undefined se incerto.
- `app/components/ImageUploader.tsx`: usa l'originale quando manca l'anteprima e conserva l'originale per il ritaglio successivo.
- `app/components/SharedImageHandler.tsx`: comportamento equivalente per immagini condivise.
- `lib/event-media.test.mjs`: test esistenti per coordinate, pixel del ritaglio e API con provider simulati.
- `docs/API_REFERENCE.md`: documenta il ripiego sull'originale che questa modifica deve sostituire.

## Tasks & Acceptance

**Execution:**
- [x] `lib/poster-crop.ts` -- definire e validare un esito privacy esplicito insieme ai bounds; gestire la locandina intera e rifiutare esiti incerti -- separare decisione di sicurezza e semplice presenza di un rettangolo.
- [x] `app/api/process-image/route.ts` -- richiedere valutazione privacy, ritagliare e verificare l'immagine risultante con vision; rispondere con errore recuperabile quando il controllo non passa -- impedire il ripiego implicito sullo screenshot.
- [x] `app/api/process-image/route.ts` -- limitare la trascrizione e l'estrazione ai contenuti dell'evento; non aggiungere dati social al testo strutturato e ai messaggi di debug introdotti -- evitare di trasformare nomi di contatti in organizzatori.
- [x] `app/components/ImageUploader.tsx`, `app/components/SharedImageHandler.tsx` -- non conservare lo screenshot originale come sorgente alternativa per una copertina sanitizzata; mantenere gestione errori e PDF esistenti -- evitare il ripristino involontario dei dati esclusi.
- [x] `lib/event-media.test.mjs` -- estendere i test esistenti con la matrice, provider simulati e controlli sui pixel -- verificare sia il ritaglio sia il comportamento in caso di incertezza.
- [x] `docs/API_REFERENCE.md` -- documentare nuovo contratto, errori, limiti del controllo AI e ambito -- rimuovere l'indicazione obsoleta del ripiego sull'originale.

**Acceptance Criteria:**
- Given uno screenshot approvato, when viene mostrata la copertina e poi pubblicato l'evento, then l'immagine selezionata e quella verificata, senza ripristinare automaticamente l'originale.
- Given un'immagine rifiutata o un provider non disponibile, when il caricamento termina, then il flusso mostra un errore recuperabile e non procede con lo screenshot originale.
- Given una locandina con foto pubblica di un artista, when il controllo riconosce tutto il contenuto come pertinente all'evento, then la foto e i dettagli del poster vengono conservati.
- Given uno screenshot con foto dell'artista nella locandina e foto profilo di chi ha pubblicato lo stato o la storia, when viene prodotto il ritaglio, then la foto dell'artista resta intatta e quella dell'utente non compare nel risultato.

## Spec Change Log

2026-10-18: Correzione dopo prova utente. Verificati con richieste reali OpenAI 429 credit_balance_exhausted e Groq Scout 404; qwen/qwen3.8-27b disponibile con input visivo. Aggiunto failover OpenAI -> Groq solo su eccezioni, con modelli configurabili. I guasti dei provider restituiscono 503 VISION_SERVICE_UNAVAILABLE, distinti dal rifiuto privacy 422; entrambi sono avvisi attesi senza overlay Next.js. Una prima prova vision reale ha riprodotto coordinate troppo strette su screenshot verticale: aggiunto un riferimento quadrato con padding, senza deformare la locandina. La stessa prova sintetica con due avatar ha poi restituito 200 con ritaglio verificato 302x385. OCR ed estrazione strutturata simulati nella prova live; screenshot originale dell'utente non inviato ai provider da questa sessione.

2026-10-18: Revisione completata con controlli indipendenti del diff, dei casi limite e dei criteri di accettazione. Correzioni locali: rifiuto delle risposte vision con finish_reason diverso da stop, approvazione privacy obbligatoriamente finale, JPEG normalizzato invece del PNG per limitare l'espansione del payload, risoluzione del ritaglio preservata per verifica e OCR. Il ritaglio arrotonda verso l'interno per non includere pixel esterni. Nessuna modifica ai requisiti approvati.

## Design Notes

La verifica AI e probabilistica. Il comportamento prudente in caso di errore elimina il ripiego oggi certamente rischioso, senza promettere che il modello riconosca ogni dato personale. Il contenuto originale viene comunque inviato al provider vision per l'analisi: questa funzione protegge dalla pubblicazione involontaria, non costituisce elaborazione esclusivamente locale. Nessun nuovo servizio o archivio di immagini e previsto.

## Verification

**Commands:**
- `node --experimental-strip-types --test lib/event-media.test.mjs` -- test esistenti e nuovi casi privacy superati senza chiamate reali ai provider.
- `npx eslint app/api/process-image/route.ts lib/poster-crop.ts app/components/ImageUploader.tsx app/components/SharedImageHandler.tsx` -- nessun nuovo errore nelle parti modificate; segnalare eventuali problemi preesistenti.

**Manual checks:**
- Caricare screenshot sintetici WhatsApp, Instagram e desktop; verificare copertina, errore nei casi incerti e impossibilita di ripristinare lo screenshot originale dal ritaglio.
- Verificare una locandina senza interfaccia social e la conservazione delle immagini pubbliche pertinenti all'evento.

**Results:** 19 test media superati, inclusi 19 scenari API privacy e 9 scenari dei client. Aggiunte regressioni per credito OpenAI esaurito, fallback Groq, guasto di entrambi i provider e assenza di console error sugli avvisi attesi. Prova live dei due passaggi vision su screenshot sintetico con avatar: HTTP 200 dopo la correzione geometrica; nessuna pubblicazione o scrittura nel database. Non eseguita una valutazione del modello sul file originale dell'utente o una prova manuale nel browser.

## Suggested Review Order

**Protezione delle immagini**

- Distinguere foto degli artisti da avatar e immagini personali di chi pubblica.
	[route.ts:52](../../app/api/process-image/route.ts#L52)
- Rifiutare completamenti interrotti prima di interpretare il verdetto privacy.
	[route.ts:107](../../app/api/process-image/route.ts#L107)
- Verificare il ritaglio prima di OCR ed estrazione dei dati evento.
	[route.ts:131](../../app/api/process-image/route.ts#L131)
- Validare approvazione finale, coordinate e conservazione della risoluzione.
	[poster-crop.ts:5](../../lib/poster-crop.ts#L5)

**Client senza ripieghi**

- Richiedere la copertina verificata senza conservare lo screenshot originale.
	[ImageUploader.tsx:58](../../app/components/ImageUploader.tsx#L58)
- Applicare la stessa protezione alle immagini condivise.
	[SharedImageHandler.tsx:71](../../app/components/SharedImageHandler.tsx#L71)

**Verifiche e contratto**

- Controllare pixel dell'artista, esclusione dell'avatar e rifiuti dei provider simulati.
	[event-media.test.mjs:111](../../lib/event-media.test.mjs#L111)
- Consultare errori recuperabili, ambito e limiti del controllo AI.
	[API_REFERENCE.md:250](../../docs/API_REFERENCE.md#L250)