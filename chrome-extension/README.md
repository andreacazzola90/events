# Chrome Extension - Event Creator

Questa estensione permette di:
- fare login utente sul backend
- caricare un'immagine dal PC
- catturare una porzione della pagina web visualizzata
- estrarre i dati evento via OCR (`/api/process-image`)
- creare l'evento nel tuo sistema (`/api/events`)

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

## Backend fisso

L'estensione usa URL backend fisso di produzione:

- `https://events-scanner.vercel.app`

All'utente non viene più richiesto di configurare l'URL.

## Note tecniche

- Login estensione: `POST /api/auth/extension-login`
- OCR immagine: `POST /api/process-image`
- Creazione evento: `POST /api/events`
- Per associare l'evento all'utente loggato, l'estensione invia l'header `Authorization: Basic ...`.
