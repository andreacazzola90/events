'use client';

import { useEffect, useState } from 'react';
import { Link2, Unplug, Pause, Play, Trash2, RefreshCw, Send, Plus } from 'lucide-react';

type TelegramStatus = {
  connected: boolean; status: string; botUsername: string | null; lastError: string | null;
  counts: Record<string, number>; published: number; discarded: number;
  sources: { id: string; chatId: string; title: string; chatType: string; isActive: boolean; consentedAt: string | null; verifiedAt: string | null; lastError: string | null; lastScannedAt: string }[];
};

const messages: Record<string, string> = {
  telegram_key_not_configured: 'Chiave di cifratura server non configurata.',
  telegram_https_not_configured: 'Webhook HTTPS pubblico non configurato.',
  invalid_bot_token: 'Token bot non valido.',
  telegram_token_revoked: 'Token revocato. Disconnetti e collega nuovamente il bot.',
  telegram_api_rejected: 'Telegram ha rifiutato la richiesta. Verifica token, chat e permessi del bot.',
  telegram_source_forbidden: 'Il bot non ha accesso alla fonte. Verifica i permessi prima di riautorizzarla.',
  telegram_bot_forbidden: 'Telegram ha negato questa operazione al bot. Verifica le autorizzazioni.',
  telegram_unavailable: 'Telegram non raggiungibile. Riprova piu tardi.',
  telegram_rate_limited: 'Limite Telegram raggiunto. Riprova piu tardi.',
  telegram_webhook_failed: 'Registrazione webhook non riuscita. Conferma la disconnessione prima di riprovare.',
  telegram_disconnect_unconfirmed: 'Disconnessione remota non confermata. Riprova Disconnetti prima di collegare un bot.',
  connection_busy: 'Operazione Telegram in corso. Aggiorna lo stato prima di riprovare.',
  connection_changed: 'La connessione e cambiata. Aggiorna lo stato prima di riprovare.',
  source_changed: 'La fonte e cambiata durante la verifica. Conferma nuovamente il consenso.',
  privacy_mode_limited: 'Privacy mode limita la lettura del gruppo. La fonte non e attiva.',
  bot_not_member: 'Il bot non e membro della chat. La fonte non e attiva.',
  protected_content: 'La chat protegge i contenuti. La fonte non e attiva.',
  unsupported_chat: 'Sono ammessi solo canali e gruppi autorizzati, non chat personali.',
  chat_and_consent_required: 'Inserisci un chat ID valido e conferma il consenso alla ripubblicazione.',
  same_origin_required: 'Origine della richiesta non valida. Verifica la configurazione server.',
  telegram_not_connected: 'Collega prima un bot.',
  disconnect_first: 'Disconnetti il bot attuale prima di cambiarlo.',
  source_limit: 'Raggiunto il limite di 50 fonti per bot.',
};
const errorMessage = (code: unknown) => typeof code === 'string' && messages[code] ? messages[code] : 'Operazione non riuscita. Verifica configurazione e disponibilita del servizio.';

async function telegramRequest(body?: Record<string, unknown>, signal?: AbortSignal) {
  const response = await fetch('/api/admin/telegram', {
    ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
    cache: 'no-store', signal,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data.error === 'string' && messages[data.error] ? errorMessage(data.error)
    : response.status === 401 || response.status === 403 ? 'Accesso admin richiesto.' : errorMessage(data.error));
  return data;
}

export default function TelegramAdmin() {
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [token, setToken] = useState('');
  const [chatId, setChatId] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const canConnect = Boolean(status && ['disconnected', 'failed'].includes(status.status));
  const lifecycleBusy = status?.status === 'connecting' || status?.status === 'disconnecting';

  useEffect(() => {
    const controller = new AbortController();
    void telegramRequest(undefined, controller.signal).then(setStatus).catch(() => {
      if (!controller.signal.aborted) setError('Stato Telegram non disponibile. Verifica configurazione e migrazione.');
    });
    return () => controller.abort();
  }, []);

  async function perform(body?: Record<string, unknown>) {
    setBusy(true); setError(''); setNotice('');
    if (body?.action === 'connect') setToken('');
    try {
      const reply = await telegramRequest(body);
      if (body?.action === 'disconnect' && !reply.remoteRemoved) setNotice('Accesso locale rimosso. Rimozione webhook remota non confermata: verifica il bot su Telegram.');
      if (body?.action === 'save-source') { setChatId(''); setConsent(false); }
      setStatus(body ? await telegramRequest() : reply);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Operazione non riuscita.');
      if (body?.action === 'connect' || body?.action === 'disconnect') {
        try { setStatus(await telegramRequest()); } catch { setStatus(null); }
      }
    }
    finally { setToken(''); setBusy(false); }
  }

  return (
    <section aria-labelledby="telegram-heading" className="glass-effect rounded-2xl p-6 sm:p-8 min-w-0" data-testid="telegram-admin">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 id="telegram-heading" className="text-2xl font-semibold text-white flex items-center gap-2"><Send size={22} aria-hidden="true" />Telegram</h2>
        <div className="flex items-center gap-3 flex-wrap min-w-0 max-w-full">
          <span className="text-sm text-gray-300 break-all min-w-0">{!status ? 'Stato non disponibile' : status.connected ? `@${status.botUsername}` : status.status === 'disconnect_unknown' ? 'Disconnessione da confermare' : status.status === 'disconnecting' ? 'Disconnessione in corso' : status.status === 'connecting' ? 'Collegamento in corso' : status.status === 'disconnected' ? 'Non collegato' : 'Collegamento non attivo'}</span>
          <button type="button" className="btn btn-ghost btn-square" title="Aggiorna stato Telegram" aria-label="Aggiorna stato Telegram" disabled={busy} onClick={() => void perform()}><RefreshCw size={18} /></button>
        </div>
      </div>
      {error && <p role="alert" className="text-red-300 mt-4 break-words">{error}</p>}
      {notice && <p role="status" className="text-amber-200 mt-4 break-words">{notice}</p>}
      {status?.lastError && <p className="text-amber-200 mt-3">{errorMessage(status.lastError)}</p>}
      {!status?.connected ? (
        <form className="flex flex-wrap items-end gap-3 mt-5" onSubmit={event => { event.preventDefault(); void perform({ action: 'connect', token }); }}>
          <label className="text-sm text-gray-200 flex-1 min-w-0 space-y-2">
            <span>Token bot</span>
            <input aria-label="Token bot" type="password" autoComplete="off" spellCheck={false} required maxLength={128} value={token} disabled={busy}
              onChange={event => setToken(event.target.value)} className="block w-full rounded-xl bg-white/10 border border-white/20 px-3 py-2 text-white" />
          </label>
          <button className="btn btn-primary" disabled={busy || !canConnect || !token.trim()}><Link2 size={18} />Collega bot</button>
          {status && status.status !== 'disconnected' && <button type="button" className="btn btn-outline" disabled={busy || lifecycleBusy} onClick={() => void perform({ action: 'disconnect' })}><Unplug size={18} />Disconnetti</button>}
        </form>
      ) : (
        <>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-gray-200 mt-5" aria-label="Conteggi Telegram">
            <span>In coda: {status.counts.pending || 0}</span><span>In elaborazione: {status.counts.processing || 0}</span>
            <span>Pubblicati: {status.published}</span><span>Scartati: {status.discarded}</span><span>Messaggi ignorati: {status.counts.skipped || 0}</span><span>Falliti: {status.counts.failed || 0}</span>
          </div>
          <ul className="mt-5 divide-y divide-white/10">
            {status.sources.map(source => (
              <li key={source.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0 flex-1 break-words"><p className="text-white font-medium">{source.title}</p>
                  <p className="text-sm text-gray-400">{source.chatId} · {source.isActive ? 'Attiva' : 'In pausa'} · {source.chatType}</p>
                  {source.lastError && <p className="text-sm text-amber-200">{errorMessage(source.lastError)}</p>}
                </div>
                <div className="flex gap-1 shrink-0">
                  {source.isActive ? <button type="button" className="btn btn-ghost btn-square" title={`Metti in pausa ${source.title}`} aria-label={`Metti in pausa ${source.title}`} disabled={busy} onClick={() => void perform({ action: 'pause-source', sourceId: source.id })}><Pause size={18} /></button>
                    : <button type="button" className="btn btn-ghost btn-square" title={`Riautorizza ${source.title}`} aria-label={`Riautorizza ${source.title}`} disabled={busy} onClick={() => { setChatId(source.chatId); setConsent(false); }}><Play size={18} /></button>}
                  <button type="button" className="btn btn-ghost btn-square" title={`Revoca ${source.title}`} aria-label={`Revoca ${source.title}`} disabled={busy} onClick={() => void perform({ action: 'remove-source', sourceId: source.id })}><Trash2 size={18} /></button>
                </div>
              </li>
            ))}
          </ul>
          <form className="mt-5 space-y-4" onSubmit={event => { event.preventDefault(); void perform({ action: 'save-source', chatId, consent }); }}>
            <label className="text-sm text-gray-200 space-y-2 block"><span>Chat ID del canale o gruppo</span>
              <input aria-label="Chat ID del canale o gruppo" type="text" inputMode="text" pattern="-[0-9]+" maxLength={21} required value={chatId} disabled={busy} onChange={event => setChatId(event.target.value)}
                className="block w-full rounded-xl bg-white/10 border border-white/20 px-3 py-2 text-white" />
            </label>
            <label className="flex items-start gap-3 text-sm text-gray-200"><input type="checkbox" required checked={consent} disabled={busy} onChange={event => setConsent(event.target.checked)} className="checkbox checkbox-sm shrink-0" />
              <span>Autorizzo la ripubblicazione pubblica degli eventi e delle locandine di questa fonte e dichiaro di averne il diritto, distinto dall&apos;accesso del bot.</span>
            </label>
            <div className="flex flex-wrap gap-3 justify-between">
              <button className="btn btn-primary" disabled={busy || !consent || !chatId}><Plus size={18} />Verifica e autorizza fonte</button>
              <button type="button" className="btn btn-outline" disabled={busy} onClick={() => void perform({ action: 'disconnect' })}><Unplug size={18} />Disconnetti</button>
            </div>
          </form>
        </>
      )}
    </section>
  );
}