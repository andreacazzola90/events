# AI Vision Cloud

Le immagini sono analizzate intere per estrarre i dati dell'evento, con OCR come fallback. Il ritaglio automatico e le relative chiamate AI di localizzazione e verifica privacy sono stati rimossi. La copertina mantiene l'intera immagine caricata, orientata e convertita in JPEG, senza tagli o padding. Senza override comuni, l'estrazione visiva preferisce Groq seguito da NVIDIA. Gemini e OpenRouter restano configurabili esplicitamente. L'estrazione strutturata degli eventi, i PDF e il cron continuano a usare Groq.

## Provider E Fallback

`AI_VISION_PROVIDERS` configura l'ordine comune (nomi separati da virgole). `AI_VISION_EXTRACTION_PROVIDERS` ha precedenza per l'estrazione immagini. `AI_VISION_CROP_PROVIDERS` non e piu utilizzata. Si provano solo provider con chiave configurata. L'analyzer ha un budget di 180 secondi e un timeout massimo di 60 secondi per chiamata. La route immagini ha un limite Vercel di 300 secondi.

Una risposta vision troncata viene scartata e puo attivare il fallback. Se non si riescono a estrarre dati leggibili neanche con il fallback OCR, la generazione resta in errore. Non vengono piu prodotti avvisi o errori di ritaglio.

## Configurazione Server

Esempio di configurazione senza segreti reali:

```dotenv
AI_VISION_PROVIDERS=nvidia,groq
AI_VISION_EXTRACTION_PROVIDERS=groq,nvidia
NVIDIA_API_SECRET_KEY=
NVIDIA_VISION_MODEL=nvidia/nemotron-3.5-super-vl-120b-a12b
GROQ_API_SECRET_KEY=
GROQ_VISION_MODEL=qwen/qwen3.8-27b
```

Inserire le chiavi solo nelle variabili server dell'ambiente di sviluppo o in Vercel. Non usare prefissi `NEXT_PUBLIC_`, non pubblicare chiavi nel repository e non inviarle in chat. Le chiavi mancanti vengono saltate. Gemini e OpenRouter si possono riattivare aggiungendoli esplicitamente a `AI_VISION_PROVIDERS`; OpenRouter richiede un modello multimodale il cui identificatore termina in `:free`.

NVIDIA usa `NVIDIA_VISION_MODEL`; Groq usa `GROQ_VISION_MODEL`. Gli adapter Gemini e OpenRouter sono disponibili per riattivazione esplicita con i rispettivi modelli e chiavi, dopo aver verificato quota e supporto immagini.

## Attivazione Su Vercel

1. Aprire il progetto in Vercel e andare in Settings > Environment Variables.
2. Aggiungere `NVIDIA_API_SECRET_KEY`, `NVIDIA_VISION_MODEL`, `GROQ_API_SECRET_KEY` e `GROQ_VISION_MODEL` agli ambienti, normalmente Production e Preview. Il default usa NVIDIA per primo e Groq come fallback.
3. Eseguire un nuovo deployment per applicare la configurazione.
4. Provare una locandina sintetica o pubblica, verificando l'estrazione, la copertina intera e il fallback in caso di quota esaurita.

Riavviare il server locale dopo aver modificato le variabili ambiente; su Vercel creare un nuovo deployment per applicarle.

## Gratuituita, Licenze E Dati

- Quote, disponibilita, prezzi e trattamento dei dati dipendono dal piano e dal provider e possono cambiare. Verificare le condizioni prima di inviare screenshot personali.
- Lo screenshot originale viene inviato al provider per l'estrazione dati; il fallback OCR puo analizzare l'originale. I prompt indicano di ignorare dati personali estranei all'evento nel testo estratto.
- La copertina non viene piu verificata o anonimizzata automaticamente: avatar, nomi utente, notifiche e altri elementi presenti nell'upload restano visibili. Controllare l'immagine prima della pubblicazione.

## Ricerca Web

La verifica online degli eventi usa Tavily se `TAVILY_API_KEY` e presente, altrimenti Google Custom Search con `GOOGLE_API_SECRET_KEY` e `GOOGLE_CX`. La sola presenza delle variabili abilita il tentativo di ricerca, non prova che il provider sia autorizzato.

Un HTTP 403 con `API_KEY_SERVICE_BLOCKED` indica che la chiave Google non puo chiamare `customsearch.googleapis.com`. Verificare le restrizioni API della chiave in Google Cloud Console e che Custom Search API sia abilitata nello stesso progetto. Gli errori di ricerca sono non bloccanti; il log riporta provider, status e reason senza chiavi.

## Verifica

```bash
node --experimental-strip-types --test lib/event-media.test.mjs
npx eslint lib/vision-ai.ts app/api/process-image/route.ts lib/event-media.test.mjs
```

Fonti: [NVIDIA NIM](https://build.nvidia.com/), [Groq API](https://console.groq.com/docs/overview).
