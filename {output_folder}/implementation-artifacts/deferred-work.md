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
- Instagram: rinviati collegamento account, lettura di post e stories accessibili; mantenere distinta la pubblicazione di stories gia esistente.
- WhatsApp: rinviata acquisizione autorizzata tramite API ufficiali; Business/webhook non equivalgono all'accesso universale alle chat e ai gruppi dell'account personale.
- Telegram: sessione personale, storico e stories fuori dalla prima fase basata su bot; richiedono valutazione tecnica e autorizzazione separate. Non sostituire silenziosamente la richiesta originaria di collegare l'account personale.
- Per tutte le fasi conservare pubblicazione automatica dei soli eventi validi, tracciabilita, privacy e prevenzione dei duplicati; nessuna ripubblicazione privata solo perche visibile all'admin.