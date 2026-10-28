# AI Vision Cloud

Le immagini sono analizzate intere per estrarre i dati dell'evento, con OCR come fallback. Al caricamento partono in parallelo l'estrazione e `POST /api/crop-image`, prima della pubblicazione. Appena pronti i dati, la bozza appare con l'immagine originale e lo stato "Immagine in elaborazione"; il crop verificato sostituisce automaticamente la copertina. Su errore o incertezza l'originale viene escluso dalla pubblicazione e resta disponibile solo per il ritaglio manuale; viene proposta la scelta di immagini web. Il pulsante Pubblica si abilita quando termina il controllo e salva la copertina scelta oppure l'evento senza immagine. PDF e link non attivano questo ramo; i ritagli manuali hanno precedenza. L'estrazione strutturata degli eventi, i PDF e il cron continuano a usare Groq.

## Provider E Fallback

Il riferimento quadrato usato per la localizzazione puo contenere padding bianco sintetico. Un riquadro affidabile che include quel padding viene intersecato con i pixel originali prima del ritaglio, anziche scartato per il solo sconfinamento. Riquadri vuoti o troppo piccoli restano rifiutati e il crop risultante deve comunque superare la verifica privacy.

La bozza mostra uno stato persistente accanto alla copertina: "Immagine in elaborazione", "Ritaglio completato" oppure "Ritaglio non riuscito - Originale escluso dalla pubblicazione". Un fallimento concluso prima dell'estrazione resta visibile quando appare la bozza. Le copertine scelte manualmente mostrano invece "Immagine modificata manualmente"; l'esito automatico non viene attribuito alla nuova immagine.

`AI_VISION_PROVIDERS` configura l'ordine comune (nomi separati da virgole). `AI_VISION_EXTRACTION_PROVIDERS` ha precedenza per l'estrazione immagini. L'estrazione mantiene un budget di 180 secondi e un timeout massimo di 60 secondi per chiamata; la route immagini ha un limite Vercel di 300 secondi.

`AI_VISION_CROP_PROVIDERS` configura separatamente il crop (default `groq,nvidia`, senza ereditare l'ordine comune). Il ramo AI condivide 45 secondi tra localizzazione, fallback e verifica, con annullamento server dopo 50 secondi e client dopo 55, entro il limite funzione di 60 secondi. Solo per Groq e consentito un singolo retry complessivo dopo HTTP 429: deve essere presente `Retry-After`, l'attesa deve essere al massimo 20 secondi e deve rimanere budget sufficiente. Esaurito il tentativo, il ramo passa a NVIDIA se configurata e se rimane tempo; la verifica successiva evita il provider gia fallito. Nessun retry di rifiuti privacy, nessun job persistente, scrittura DB o upload storage prima della pubblicazione. Cambiare bozza o uscire annulla risultato e attesa; un errore finale esclude l'originale dalla pubblicazione.

Una risposta vision troncata viene scartata e puo attivare il fallback. Se non si riescono a estrarre dati leggibili neanche con il fallback OCR, la generazione resta in errore. Il solo fallimento del crop termina lo stato e consente la scelta web, il ritaglio manuale o la pubblicazione senza immagine. L'aggiornamento non sovrascrive le modifiche manuali e si applica anche alle bozze con piu eventi.

Il crop usa JSON nativo e distingue il bordo inferiore dell'header social dal rettangolo della locandina. Puo eliminare un margine di sfondo occupato da avatar/nome/controlli, ma deve preservare loghi, titolo, foto della relatrice e dati dell'evento. La verifica finale resta obbligatoria. L'originale resta disponibile per il ritaglio manuale anche dopo la sostituzione automatica.

Un `429 rate_limit_exceeded` puo dipendere dai token al minuto anche con poche immagini: estrazione, localizzazione e verifica consumano la stessa quota Groq. Il fallback NVIDIA usa una quota separata, non illimitata. Se tutti i tentativi falliscono, l'originale non viene pubblicato automaticamente. Nessun piano a pagamento viene attivato dal codice; verificare comunque quota e condizioni del proprio account NVIDIA. Le quote Groq sono per organizzazione: una seconda chiave della stessa organizzazione non le aumenta. Il motivo viene mostrato nella bozza e restituito nell'header `X-Image-Crop-Reason` (quota, timeout, configurazione, bounds o privacy).

## Configurazione Server

Esempio di configurazione senza segreti reali:

```dotenv
AI_VISION_PROVIDERS=nvidia,groq
AI_VISION_EXTRACTION_PROVIDERS=groq,nvidia
AI_VISION_CROP_PROVIDERS=groq,nvidia
NVIDIA_API_SECRET_KEY=
NVIDIA_VISION_MODEL=nvidia/nemotron-3.5-super-vl-120b-a12b
GROQ_API_SECRET_KEY=
GROQ_VISION_MODEL=qwen/qwen3.8-27b
```

Inserire le chiavi solo nelle variabili server dell'ambiente di sviluppo o in Vercel. Non usare prefissi `NEXT_PUBLIC_`, non pubblicare chiavi nel repository e non inviarle in chat. Le chiavi mancanti vengono saltate. Gemini e OpenRouter si possono riattivare aggiungendoli esplicitamente a `AI_VISION_PROVIDERS`; OpenRouter richiede un modello multimodale il cui identificatore termina in `:free`.

NVIDIA usa `NVIDIA_VISION_MODEL`; Groq usa `GROQ_VISION_MODEL`. Gli adapter Gemini e OpenRouter sono disponibili per riattivazione esplicita con i rispettivi modelli e chiavi, dopo aver verificato quota e supporto immagini.

Per il solo crop JSON, NVIDIA usa uno schema vincolante con coordinate e confidenza normalizzate 0..1 e `chat_template_kwargs.enable_thinking=false`. Questo evita ragionamento troncato e risposte in percentuale; non cambia il validatore del ritaglio o le soglie privacy. Prova reale su fixture sintetica: due risposte complete e crop verificato 677x1126 in circa 5 secondi. Non dimostra accuratezza su ogni screenshot o disponibilita illimitata del provider.

## Attivazione Su Vercel

1. Aprire il progetto in Vercel e andare in Settings > Environment Variables.
2. Verificare `GROQ_API_SECRET_KEY` e aggiungere `NVIDIA_API_SECRET_KEY` se assente, negli ambienti Production e Preview. Non aggiungere prefissi `NEXT_PUBLIC_`. I modelli hanno gia default nel codice; `NVIDIA_VISION_MODEL` e `GROQ_VISION_MODEL` sono override facoltativi.
3. Impostare `AI_VISION_CROP_PROVIDERS=groq,nvidia`, oppure rimuovere un vecchio override `groq` per usare il nuovo default. Il crop usa Groq per primo e NVIDIA come fallback, indipendentemente dall'ordine dell'estrazione.
4. Eseguire un nuovo deployment dopo queste modifiche. Provare una locandina sintetica: verificare bozza visibile durante il crop, sostituzione prima di Pubblica e nessuna copertina automatica se tutti i provider falliscono.

La presenza delle chiavi locali non dimostra che siano presenti su Vercel. Il controllo remoto richiede accesso autenticato al progetto; senza tale accesso non e possibile dichiarare quali variabili manchino. Non inviare i valori delle chiavi in chat.

Riavviare il server locale dopo aver modificato le variabili ambiente; su Vercel creare un nuovo deployment per applicarle.

## Gratuituita, Licenze E Dati

- Quote, disponibilita, prezzi e trattamento dei dati dipendono dal piano e dal provider e possono cambiare. Verificare le condizioni prima di inviare screenshot personali.
- Lo screenshot originale viene inviato al provider per l'estrazione dati; il fallback OCR puo analizzare l'originale. I prompt indicano di ignorare dati personali estranei all'evento nel testo estratto.
- L'originale puo essere visibile temporaneamente durante l'elaborazione, ma viene escluso dalla pubblicazione automatica se il crop fallisce. Il ramo crop puo inviare lo screenshot a Groq e NVIDIA; un'approvazione AI non e una garanzia di privacy. Controllare le immagini prima della pubblicazione. Foto di artisti e contatti appartenenti alla locandina non vengono rimossi.
- Groq: creare la chiave nella [console](https://console.groq.com/keys), verificare modello vision e quota Free nei [limiti account](https://console.groq.com/settings/limits). Il piano Developer e a pagamento; non viene attivato dal codice. Valutare Zero Data Retention nei [Data Controls](https://console.groq.com/settings/data-controls), considerando le [condizioni dati](https://console.groq.com/docs/your-data).
- OpenRouter e un'alternativa esplicita solo con modello vision `:free`; quote e modelli disponibili variano. Non viene usato un fallback a pagamento.
- Gemini puo essere valutato separatamente, ma i [termini](https://ai.google.dev/gemini-api/terms) richiedono Paid Services per API clients offerti a utenti SEE, Svizzera e Regno Unito: non e il default gratuito di produzione per questa app.

## Ricerca Web

La verifica online degli eventi usa Tavily se `TAVILY_API_KEY` e presente, altrimenti Google Custom Search con `GOOGLE_API_SECRET_KEY` e `GOOGLE_CX`. La sola presenza delle variabili abilita il tentativo di ricerca, non prova che il provider sia autorizzato.

Un HTTP 403 con `API_KEY_SERVICE_BLOCKED` indica che la chiave Google non puo chiamare `customsearch.googleapis.com`. Verificare le restrizioni API della chiave in Google Cloud Console e che Custom Search API sia abilitata nello stesso progetto. Gli errori di ricerca sono non bloccanti; il log riporta provider, status e reason senza chiavi.

## Verifica

```bash
node --experimental-strip-types --test lib/event-media.test.mjs
npx tsc --noEmit
npx eslint lib/vision-ai.ts lib/poster-crop.ts app/api/events/route.ts app/components/ImageUploader.tsx app/components/SharedImageHandler.tsx app/components/EventDisplay.tsx app/types/event.ts lib/event-media.test.mjs
```

Fonti: [NVIDIA NIM](https://build.nvidia.com/), [Groq API](https://console.groq.com/docs/overview).

Per riprodurre il crop senza creare eventi, usare uno screenshot sintetico oppure un file locale autorizzato (questo comando invia l'immagine al provider configurato e consuma quota):

```bash
node --experimental-strip-types scripts/diagnose-poster-crop.mjs
node --experimental-strip-types scripts/diagnose-poster-crop.mjs /percorso/screenshot.png
node --experimental-strip-types scripts/diagnose-poster-crop.mjs --http --with-extraction
```

L'opzione `--describe` controlla separatamente la comprensione visiva del modello. Nessuna scrittura nel database o upload storage viene eseguito dal riproduttore.

La prova `--http --with-extraction` invia richieste reali concorrenti a `localhost:3000`, come l'upload dell'app, e consuma quota. Verificata il 21 ottobre con Groq: estrazione HTTP 200 e crop HTTP 200 (JPEG 682x1140 da fixture sintetica 760x1240). Non prova l'accuratezza su ogni screenshot. OpenRouter era configurato ma i modelli gratuiti provati hanno restituito 429 o output troncato; non e stato attivato un fallback non verificato, ne modificata alcuna chiave.
