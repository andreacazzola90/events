# Deferred Work

## Daily cron review, 2026-10-05

- Preexisting: processEventLink e successive geocodifica/persistenza non ricevono un segnale di cancellazione. Il budget e' cooperativo tra estrazioni: una singola estrazione eccezionalmente lunga puo' ancora superare maxDuration. Valutare timeout/cancellazione end-to-end come intervento dedicato.
- Preexisting: il proxy manuale comunica failure con status=500 nel corpo JSON, mantenendo HTTP 200. I client attuali interpretano il corpo; valutare il contratto HTTP separatamente prima di modificarlo.
- Operational: pubblicare il fix e verificare log/Chromium nel deployment Vercel. La sessione non dispone di progetto Vercel collegato o VERCEL_TOKEN e non ha avviato operazioni di deployment.