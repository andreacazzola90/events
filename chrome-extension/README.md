# Chrome Extension - Event Creator

Questa estensione permette di:
- fare login utente sul backend
- caricare un'immagine dal PC
- catturare una porzione della pagina web visualizzata
- estrarre i dati evento via OCR (`/api/process-image`)
- creare l'evento nel tuo sistema (`/api/events`)
- agli admin verificati, analizzare una selezione di testo di un evento Facebook o il ritaglio di una story Instagram

## Installazione (sviluppo)

1. Apri Chrome e vai su `chrome://extensions`.
2. Attiva **Modalità sviluppatore**.
3. Clicca **Load unpacked** e seleziona la cartella `chrome-extension`.

## Configurazione backend

Nel backend puoi definire le origin consentite per l'estensione:

- `EXTENSION_ALLOWED_ORIGINS=chrome-extension://*`

Oppure, per limitare a una singola estensione:

- `EXTENSION_ALLOWED_ORIGINS=chrome-extension://<ID_ESTENSIONE>`

## Uso

1. Apri il popup dell'estensione.
2. Fai login con email/password del sito.
3. Scegli una sorgente immagine:
   - **Carica immagine** da file
   - **Seleziona area pagina** per catturare una parte del sito
4. Clicca **Estrai evento dall'immagine**.
5. Verifica/modifica i campi estratti.
6. Clicca **Crea evento**.

## Import social per admin

1. Accedi al popup con l'account del portale. Il ruolo admin viene verificato sul backend all'apertura del popup e prima di ogni importazione; un ruolo non admin o revocato non può avviare l'analisi.
2. Usa **Apri Facebook** o **Apri Instagram** per aprire il sito ufficiale. Accedi direttamente lì, nel browser: l'estensione non legge né riceve password, cookie o token social.
3. Facebook: apri la pagina di un singolo evento, seleziona manualmente il testo da condividere e scegli **Usa il testo selezionato**. Instagram: apri una story attiva e scegli **Ritaglia la locandina**; seleziona solo l'area della locandina.
4. Controlla l'anteprima locale e conferma di avere il diritto di condividere il contenuto. Solo dopo questa conferma viene inviata al backend l'esatta selezione di testo o immagine, senza HTML, URL social, query della pagina o screenshot integrale. Il backend può inviare la selezione ai provider AI configurati per l'estrazione.
5. Rivedi i campi evento restituiti e clicca **Crea evento** solo se desideri procedere. L'analisi non crea né pubblica eventi e non allega automaticamente immagini o link social.

Il ritaglio story è tenuto esclusivamente nella memoria di sessione Chrome (non su disco): è recuperabile per due minuti e viene rimosso quando viene letto o termina la sessione dell'estensione. Il testo selezionato e la preview restano solo nella memoria del popup; non vengono salvati come sorgente. Se la scheda cambia durante la cattura, il ritaglio viene rifiutato.

L'import social usa i permessi browser già dichiarati dall'estensione (`activeTab`, `scripting`, `tabs` e `storage`) e non accede a messaggi, feed o API private. Importa solo contenuti autorizzati alla condivisione; non usare post privati, conversazioni o contenuti riservati.

## Backend

Il backend predefinito è:

- `https://events-scanner.vercel.app`

L'estensione mantiene l'URL backend precedentemente verificato in `chrome.storage.local` per non interrompere una configurazione esistente. La preview social viene inviata solo a quell'URL, senza tentare fallback su un secondo backend.

All'utente non viene più richiesto di configurare l'URL.

## Note tecniche

- Login estensione: `POST /api/auth/extension-login`
- OCR immagine: `POST /api/process-image`
- Preview import social admin: `POST /api/admin/social-browser-import`
- Creazione evento: `POST /api/events`
- Per associare l'evento all'utente loggato, l'estensione invia l'header `Authorization: Basic ...`.

Per eseguire le verifiche locali senza accedere a social o provider AI: `node --test chrome-extension/social-import.test.mjs`.
