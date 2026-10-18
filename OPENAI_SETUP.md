# AI Cloud Per Le Immagini

Il controllo privacy e il ritaglio delle locandine usano esclusivamente API cloud, compatibili con Vercel. Nessun modello locale o server Ollama e richiesto.

## Provider E Fallback

Sono supportati Groq, Gemini e OpenRouter. L'ordine predefinito e `groq,gemini,openrouter`; `AI_VISION_PROVIDERS` permette di scegliere ordine e servizi abilitati. Solo i provider elencati e con credenziali presenti vengono chiamati. Un valore vuoto disabilita il routing vision.

I due controlli condividono un budget di 20 secondi, con un timeout massimo di 7 secondi per tentativo e senza retry automatici dello SDK. Il secondo controllo non riprova provider gia falliti nel primo. Quota esaurita, credenziali non valide, timeout o errori del servizio attivano il successivo; sono riconosciuti anche errori espliciti dentro risposte HTTP 200. Non c'e attesa automatica del rinnovo della quota. Le due verifiche possono essere servite da provider diversi. Il budget riserva tempo a OCR ed estrazione nel limite Vercel di 60 secondi, ma non impone un timeout globale alle altre fasi esistenti.

Una risposta completa che rifiuta la privacy NON viene sottoposta a un altro modello per ottenere un'approvazione. Lo stesso vale per codici strutturati di rifiuto sicurezza, anche se comunicati come errori HTTP. Risposte troncate, rifiutate o malformate restano non approvate. Se tutti i servizi sono indisponibili o il budget vision termina, l'API restituisce `503 VISION_SERVICE_UNAVAILABLE`; un ritaglio non verificabile restituisce `422 POSTER_PRIVACY_REVIEW_REQUIRED`. Nessun caso ripristina lo screenshot originale.

## Configurazione Server

Esempio di configurazione senza segreti reali:

```dotenv
AI_VISION_PROVIDERS=gemini,openrouter,groq

GEMINI_API_SECRET_KEY=
GEMINI_VISION_MODEL=gemini-2.5-flash

OPENROUTER_API_SECRET_KEY=
OPENROUTER_VISION_MODEL=google/gemma-4-26b-a4b-it:free

GROQ_API_SECRET_KEY=
GROQ_VISION_MODEL=qwen/qwen3.8-27b
```

Inserire le chiavi solo nelle variabili server dell'ambiente di sviluppo o in Vercel. Non usare prefissi `NEXT_PUBLIC_`, non pubblicare chiavi nel repository e non inviarle in chat. I campi vuoti dell'esempio non attivano i servizi.

Gemini richiede una chiave da [Google AI Studio](https://aistudio.google.com/api-keys), non la chiave esistente per Google Custom Search. Per OpenRouter creare una chiave nelle [impostazioni API](https://openrouter.ai/settings/keys). Selezionare un modello con input immagini dal [catalogo](https://openrouter.ai/models): il modello nell'esempio era presente alla verifica del 18 ottobre 2026, ma disponibilita e quote possono cambiare. L'integrazione non verifica automaticamente il catalogo ad ogni richiesta.

OpenRouter viene saltato se il modello non termina con `:free` o non e impostato: non viene mai sostituito con una variante a pagamento. Un modello `:free` senza supporto immagini fallira e verra tentato il successivo provider. Non vengono aggiunti plugin o servizi a pagamento. Le variabili `OPENAI_API_SECRET_KEY` e `OPENAI_VISION_MODEL` non vengono piu usate da questo percorso vision gratuito.

## Attivazione Su Vercel

1. Aprire il progetto in Vercel e andare in Settings > Environment Variables.
2. Aggiungere le chiavi, i modelli e `AI_VISION_PROVIDERS` per gli ambienti desiderati, normalmente Production e Preview.
3. Eseguire un nuovo deployment per applicare la configurazione.
4. Provare una locandina sintetica o pubblica, verificando ritaglio e comportamento in caso di quota esaurita.

Gemini e OpenRouter sono predisposti dal codice ma non operativi fino all'inserimento di chiavi valide. Non e stato creato alcun account, attivata fatturazione o eseguito un deployment durante l'implementazione.

## Gratuituita, Licenze E Dati

- Le API gratuite hanno limiti di richieste e token, non disponibilita illimitata o garanzie di servizio. Non abilitare fatturazione o piani a pagamento per questa configurazione; il codice non puo stabilire dal solo token API il piano commerciale di Gemini o Groq.
- Gemini e un servizio proprietario, non open source. Il suo piano gratuito puo usare i contenuti per migliorare i prodotti secondo le condizioni applicabili al paese e all'account. Verificare le condizioni prima dell'attivazione su screenshot personali.
- OpenRouter e un intermediario cloud. Le politiche sui dati dipendono anche dal provider che serve il modello. Una variante gratuita non implica automaticamente licenza open source, uso commerciale illimitato o assenza di conservazione dei dati. Gemma, Qwen e gli altri modelli hanno licenze proprie da verificare.
- Lo screenshot originale viene inviato ai servizi vision prima del ritaglio; in caso di guasti puo raggiungere piu provider abilitati. Le chiavi e l'ordine configurati rendono esplicita questa scelta. Il controllo riduce il rischio di pubblicazione involontaria, non garantisce anonimizzazione assoluta.
- Solo il percorso immagini e modificato. L'estrazione testuale dei dati evento usa ancora Groq; PDF e cron mantengono i provider esistenti. Groq resta quindi necessario per completare il caricamento degli eventi anche se Gemini o OpenRouter hanno verificato l'immagine.

## Verifica

```bash
node --experimental-strip-types --test lib/event-media.test.mjs
npx eslint lib/vision-ai.ts app/api/process-image/route.ts lib/event-media.test.mjs
```

Fonti: [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing), [compatibilita OpenAI](https://ai.google.dev/gemini-api/docs/openai), [OpenRouter free variants](https://openrouter.ai/docs/guides/routing/model-variants/free), [limiti OpenRouter](https://openrouter.ai/docs/api/reference/limits).
