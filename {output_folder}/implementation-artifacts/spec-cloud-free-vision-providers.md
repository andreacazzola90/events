---
title: 'Provider AI cloud gratuiti per le immagini degli eventi'
type: 'feature'
created: '2026-10-18'
status: 'done'
baseline_commit: '983c5e0e1f682c775150c81280aaa09d70813fbd'
context: []
---

<frozen-after-approval reason="human-owned intent">

## Intent

**Problem:** Il controllo privacy e il ritaglio delle immagini dipendono da OpenAI, attualmente senza credito, e da Groq, soggetto a limiti temporanei. L'utente richiede alternative gratuite utilizzabili online, possibilmente con modelli aperti, escludendo esplicitamente AI locali.

**Approach:** Collegare Gemini e OpenRouter al percorso vision esistente con selezione server-side e fallback su errori del servizio. Mantenere Groq e le due verifiche privacy. Non promettere gratuituita illimitata: disponibilita, quota e condizioni dipendono dall'account e dal provider.

## Boundaries & Constraints

**Always:** Esecuzione esclusivamente cloud, compatibile con Vercel. Usare lo SDK OpenAI gia installato dove compatibile. Chiamare solo provider configurati e abilitati esplicitamente. Le credenziali restano nelle variabili server, mai nel browser, nei log o nella chat. Gemini richiede una chiave dedicata, distinta dalla chiave Google Custom Search. Documentare condizioni sull'uso dei dati e differenza tra servizio gratuito e licenza del modello; Gemini non e open source e le licenze dei modelli OpenRouter vanno verificate separatamente. Conservare foto degli artisti, controllo del ritaglio e divieto di ripiego sullo screenshot originale.

**Ask First:** Attivare un account a pagamento, modificare fatturazione, inviare screenshot reali a nuovi provider prima della loro configurazione esplicita, estendere la modifica a estrazione testuale, PDF o cron.

**Never:** Installare Ollama o altri runtime/modelli locali. Attivare fallback automatici su modelli a pagamento. Aggirare un rifiuto privacy consultando altri modelli finche uno approva. Dichiarare attiva un'integrazione senza credenziali o attribuire licenza open source a qualsiasi modello gratuito.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Provider configurato | Chiave e modello validi | Due verifiche vision e copertina verificata | Contratto attuale invariato |
| Quota o servizio indisponibile | 429, credito esaurito, timeout o modello non disponibile | Provare il successivo provider abilitato | Tentativi limitati e timeout espliciti |
| Rifiuto privacy | Risposta completa ma non sicura | Nessun altro provider per ribaltare il verdetto | 422 esistente |
| Risposta incompleta | Troncamento o esito malformato | Nessuna pubblicazione | Rifiuto prudente esistente |
| Tutti indisponibili | Nessun provider completa la richiesta | Nessun originale restituito | 503 VISION_SERVICE_UNAVAILABLE |
| Nuove chiavi assenti | Solo Groq configurato | Groq resta utilizzabile, nuovi servizi saltati | Nessun requisito di chiavi inutilizzate |
| OpenRouter non gratuito | Modello senza variante :free | Configurazione rifiutata, nessuna chiamata pagante | Diagnostica senza segreti |

</frozen-after-approval>

## Code Map

- `app/api/process-image/route.ts`: contiene il routing vision attuale e controlla geometria, ritaglio, verifica e OCR.
- `lib/vision-ai.ts`: nuovo modulo proprietario della selezione provider, senza cambiare la politica privacy.
- `lib/event-media.test.mjs`: simulazioni SDK, API e client gia disponibili per le regressioni.
- `OPENAI_SETUP.md`: file esistente vuoto, da usare per configurazione cloud e istruzioni Vercel.
- `docs/API_REFERENCE.md`: contratto 422/503 e descrizione dei provider.

## Tasks & Acceptance

**Execution:**
- [x] `lib/vision-ai.ts` -- implementare provider cloud abilitati, ordine configurabile, timeout e fallback solo su errori del servizio -- isolare il routing dall'analisi dell'evento.
- [x] `app/api/process-image/route.ts` -- usare il modulo vision mantenendo le due verifiche e il riferimento quadrato -- non alterare la protezione privacy.
- [x] `lib/event-media.test.mjs` -- testare provider assenti, Gemini, OpenRouter gratuito, Groq, errori, rifiuti e assenza di addebiti impliciti -- riusare la suite esistente.
- [x] `OPENAI_SETUP.md`, `docs/API_REFERENCE.md` -- documentare chiavi server e Vercel, quote, modelli, licenze e uso dei dati -- distinguere codice pronto da servizio attivato.

**Acceptance Criteria:**
- Given il deployment Vercel, when sono configurate chiavi e modelli validi, then le richieste funzionano senza processi o servizi sul computer dell'utente.
- Given un servizio limitato, when un altro provider abilitato e disponibile, then il controllo prosegue mantenendo la stessa verifica privacy.
- Given solo Groq configurato, when viene caricata un'immagine, then l'assenza di Gemini e OpenRouter non causa errori di inizializzazione.
- Given credenziali mancanti per i nuovi servizi, when termina l'implementazione, then il resoconto li indica come predisposti, non attivi o verificati dal vivo.

## Spec Change Log

2026-10-18: Revisione indipendente completata. Correzioni locali: budget condiviso di 20 secondi per i due controlli, timeout massimo 7 secondi per provider, nessun nuovo tentativo sui provider gia falliti nello stesso caricamento; riconoscimento degli errori espliciti dentro HTTP 200; codici strutturati di rifiuto sicurezza trattati come definitivi anche nelle eccezioni. Aggiunte regressioni con orologio simulato e asserzioni sui contenuti rifiutati. Le altre fasi OCR/testuali non sono state estese o rifattorizzate.

## Design Notes

Proposta: ordine cloud gratuito Groq, Gemini, OpenRouter, configurabile; OpenAI escluso dal nuovo ordine gratuito predefinito. OpenRouter richiede un modello multimodale :free selezionato dal catalogo; nessuna conversione automatica alla variante pagante. Gemini usa l'endpoint compatibile OpenAI. Limiti gratuiti e politiche dati possono cambiare e vanno verificati nell'account. Il piano gratuito Gemini puo usare i contenuti per migliorare i prodotti secondo le condizioni applicabili: documentarlo prima dell'attivazione su screenshot personali.

Fonti verificate: https://ai.google.dev/gemini-api/docs/pricing, https://ai.google.dev/gemini-api/docs/openai, https://openrouter.ai/docs/guides/routing/model-variants/free, https://openrouter.ai/docs/api/reference/limits. Al momento della pianificazione sono configurate solo le credenziali Groq fra i tre servizi proposti.

## Verification

- `node --experimental-strip-types --test lib/event-media.test.mjs` -- regressioni e nuovi casi provider superati senza chiamate a pagamento.
- `npx eslint lib/vision-ai.ts app/api/process-image/route.ts lib/event-media.test.mjs` -- nessun nuovo errore.
- Prova live opzionale con immagine sintetica, solo per provider con chiavi configurate; dichiarare quelli non verificati e non inviare screenshot personali durante i test.

**Risultati:** 24 test media superati; lint mirato superato; nessun errore dell'editor. Provider e API verificati con SDK simulato, inclusi fallback Gemini/OpenRouter in entrambe le direzioni, scadenze e rifiuti definitivi. Prova cloud reale del nuovo modulo con Groq e immagine sintetica superata. Gemini e OpenRouter non attivati dal vivo per assenza delle rispettive chiavi. Nessuna modifica alla fatturazione, nessun deployment.

## Suggested Review Order

**Routing Cloud**

- Controllare deadline condivisa, fallback e arresto sui rifiuti di sicurezza.
	[vision-ai.ts:60](../../lib/vision-ai.ts#L60)
- Verificare chiavi, ordine configurabile e vincolo OpenRouter gratuito.
	[vision-ai.ts:12](../../lib/vision-ai.ts#L12)
- Seguire i due controlli della stessa immagine senza ripristinare l'originale.
	[route.ts:95](../../app/api/process-image/route.ts#L95)

**Verifiche E Attivazione**

- Esaminare simulazioni di quote, rifiuti e passaggio fra provider.
	[event-media.test.mjs:82](../../lib/event-media.test.mjs#L82)
- Inserire le variabili server e consultare condizioni su gratuituita e dati.
	[OPENAI_SETUP.md:13](../../OPENAI_SETUP.md#L13)