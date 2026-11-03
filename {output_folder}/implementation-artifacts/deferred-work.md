# Deferred Work

## Daily cron review, 2026-10-05

- Preexisting: processEventLink e successive geocodifica/persistenza non ricevono un segnale di cancellazione. Il budget e' cooperativo tra estrazioni: una singola estrazione eccezionalmente lunga puo' ancora superare maxDuration. Valutare timeout/cancellazione end-to-end come intervento dedicato.
- Preexisting: il proxy manuale comunica failure con status=500 nel corpo JSON, mantenendo HTTP 200. I client attuali interpretano il corpo; valutare il contratto HTTP separatamente prima di modificarlo.
- Operational: pubblicare il fix e verificare log/Chromium nel deployment Vercel. La sessione non dispone di progetto Vercel collegato o VERCEL_TOKEN e non ha avviato operazioni di deployment.

## Shared image retry, 2026-10-14

- Preexisting: il service worker elimina l'immagine condivisa al primo recupero, anche se la successiva elaborazione AI fallisce; conservare la cache fino a conferma o supportare un retry.

## Social event scanning split, 2026-10-29

- Scelta S dell'utente: iniziare da Telegram con pubblicazione automatica; specifica corrente in spec-admin-social-event-scanning.md. La scelta non costituisce ancora approvazione della specifica per l'implementazione.
- Facebook: rinviati collegamento account e scansione autorizzata di pagine, gruppi e post, anche di terzi; verificare capacita API e app review prima di promettere accesso.
- Instagram: implementata (spec-admin-instagram-event-scanning.md) la scansione delle stories proprie dell'account collegato e dei post di account professionali tramite Business Discovery, con consenso per fonte; le stories di terzi non sono disponibili tramite API ufficiali e restano fuori ambito. Attivazione richiede app Meta, App Review/accesso avanzato e migrazione. Pubblicazione di stories esistente invariata e distinta.
- WhatsApp: rinviata acquisizione autorizzata tramite API ufficiali; Business/webhook non equivalgono all'accesso universale alle chat e ai gruppi dell'account personale.
- Telegram: sessione personale, storico e stories fuori dalla prima fase basata su bot; richiedono valutazione tecnica e autorizzazione separate. Non sostituire silenziosamente la richiesta originaria di collegare l'account personale.
- Per tutte le fasi conservare pubblicazione automatica dei soli eventi validi, tracciabilita, privacy e prevenzione dei duplicati; nessuna ripubblicazione privata solo perche visibile all'admin.

## Da spec-multi-event-poster-sections (review 2026-11-02)

- `/api/poster-sections`, come `/api/crop-image` e `/api/process-image`, non richiede sessione: ogni chiamata avvia un worker OCR (fino a 25 s). Valutare rate limit o login per gli endpoint di elaborazione immagini; inoltre il limite 413 si basa su `content-length` e senza header il body viene bufferizzato prima del controllo.


## Creazione evento autopilota, split 2026-11-03

- Scelta S dell'utente: ora autopilota in pagina con animazione del razzo (spec-event-creation-autopilot-rocket.md). Rinviato il completamento durevole ad app chiusa: richiede modello job Prisma + migrazione, ritaglio copertina/sezioni locandina e controllo privacy lato server (oggi nel browser), worker o cron frequente (oggi solo cron giornaliero) e notifica all'utente (web-push assente). Valutare costi di esecuzione Vercel e privacy prima di implementare.

## Da spec-event-creation-autopilot-rocket (review 2026-11-03)

- Il salvataggio (`/api/events`) non ha timeout/abort lato client: se resta appeso, l'autopilota resta in "Accensione" senza via d'uscita (stesso limite del flusso manuale).
- Pre-check duplicati fallito: l'autopilota pubblica affidandosi al 409 del server, che non intercetta quasi-duplicati.
- Eventi da link senza immagine vengono pubblicati automaticamente senza copertina (lo spec ferma solo il crop fallito).
- Il banner `?nuovo=1` appare solo con `canEdit` (creatori anonimi vedono solo il toast) e si perde se lo slug richiede `permanentRedirect`.
- Accessibilità: allo stop il focus non viene spostato sull'editor riapparso.
