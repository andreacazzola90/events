'use client';

import { useEffect, useState } from 'react';
import { Camera, Link2, Unplug, Pause, Play, Trash2, RefreshCw, Plus } from 'lucide-react';

type InstagramScanStatus = {
  configured: boolean; connected: boolean; status: string; username: string | null; tokenExpiresAt: string | null; tokenExpiresSoon: boolean;
  lastError: string | null; lastRunAt: string | null;
  lastRun: { visited: number; published: number; duplicates: number; discarded: number; failed: number } | null;
  sources: { id: string; username: string; isActive: boolean; consentedAt: string | null; lastError: string | null; lastScannedAt: string | null }[];
};

const messages: Record<string, string> = {
  instagram_not_configured: 'App Meta non configurata sul server (INSTAGRAM_APP_ID, INSTAGRAM_APP_SECRET).',
  instagram_key_not_configured: 'Chiave di cifratura server non configurata (INSTAGRAM_SCAN_ENCRYPTION_KEY).',
  instagram_origin_not_configured: 'Origine pubblica del sito non configurata (NEXTAUTH_URL o INSTAGRAM_SCAN_REDIRECT_ORIGIN).',
  instagram_token_expired: 'Accesso Instagram scaduto o revocato. Ricollega l\'account.',
  instagram_token_unreadable: 'Token non leggibile con la chiave attuale. Ricollega l\'account.',
  instagram_rate_limited: 'Limite di richieste Meta raggiunto. Riprova piu tardi.',
  instagram_permission_denied: 'Permessi Meta insufficienti. Verifica i permessi concessi e l\'App Review.',
  instagram_unavailable: 'Instagram non raggiungibile. Riprova piu tardi.',
  instagram_api_rejected: 'Meta ha rifiutato la richiesta. Verifica configurazione e permessi.',
  instagram_source_not_business: 'Account inesistente o non Business/Creator: Business Discovery non disponibile.',
  instagram_source_errors: 'Alcune fonti non sono state lette. Controlla gli errori delle singole fonti.',
  instagram_not_connected: 'Collega prima un account Instagram professionale.',
  username_and_consent_required: 'Inserisci un username valido e conferma il consenso alla ripubblicazione.',
  same_origin_required: 'Origine della richiesta non valida. Verifica la configurazione server.',
  connection_changed: 'La connessione e cambiata. Aggiorna lo stato prima di riprovare.',
  source_limit: 'Raggiunto il limite di 20 fonti.',
  source_not_found: 'Fonte non trovata. Aggiorna lo stato.',
  instagram_processing_unavailable: 'Ultima scansione non completata. Riprovera al prossimo cron.',
};
const oauthMessages: Record<string, string> = {
  connected: 'Account Instagram collegato.',
  state_invalid: 'Collegamento non valido o scaduto. Riprova.',
  denied: 'Autorizzazione negata su Facebook.',
  no_business_account: 'Nessun account Instagram professionale collegato a una Pagina Facebook autorizzata.',
  not_configured: 'Configurazione server incompleta.',
  oauth_failed: 'Collegamento non riuscito. Riprova piu tardi.',
};
const errorMessage = (code: unknown) => typeof code === 'string' && messages[code] ? messages[code] : 'Operazione non riuscita. Verifica configurazione e disponibilita del servizio.';
const formatDate = (value: string | null) => value ? new Date(value).toLocaleString('it-IT', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

async function instagramRequest(body?: Record<string, unknown>, signal?: AbortSignal): Promise<InstagramScanStatus> {
  const response = await fetch('/api/admin/instagram-scan', {
    ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
    cache: 'no-store', signal,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data.error === 'string' && messages[data.error] ? errorMessage(data.error)
    : response.status === 401 || response.status === 403 ? 'Accesso admin richiesto.' : errorMessage(data.error));
  return data;
}

export default function InstagramScanAdmin() {
  const [status, setStatus] = useState<InstagramScanStatus | null>(null);
  const [username, setUsername] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    const url = new URL(window.location.href);
    const result = url.searchParams.get('instagram');
    if (result) {
      if (result === 'connected') setNotice(oauthMessages.connected);
      else setError(oauthMessages[result] || oauthMessages.oauth_failed);
      url.searchParams.delete('instagram');
      window.history.replaceState(null, '', url.pathname + url.search + url.hash);
    }
    void instagramRequest(undefined, controller.signal).then(setStatus).catch(() => {
      if (!controller.signal.aborted) setError('Stato Instagram non disponibile. Verifica configurazione e migrazione.');
    });
    return () => controller.abort();
  }, []);

  async function perform(body?: Record<string, unknown>) {
    setBusy(true); setError(''); setNotice('');
    try {
      const reply = await instagramRequest(body);
      if (body?.action === 'save-source') { setUsername(''); setConsent(false); }
      setStatus(body ? await instagramRequest() : reply);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Operazione non riuscita.');
    } finally { setBusy(false); }
  }

  const expiresSoon = Boolean(status?.tokenExpiresSoon);
  const connectButton = (label: string) => (
    <a href="/api/admin/instagram-scan/oauth/start" className={`btn btn-primary${busy ? ' btn-disabled' : ''}`} aria-disabled={busy}><Link2 size={18} />{label}</a>
  );

  return (
    <section aria-labelledby="instagram-scan-heading" className="glass-effect rounded-2xl p-6 sm:p-8 min-w-0" data-testid="instagram-scan-admin">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 id="instagram-scan-heading" className="text-2xl font-semibold text-white flex items-center gap-2"><Camera size={22} aria-hidden="true" />Scansione Instagram</h2>
        <div className="flex items-center gap-3 flex-wrap min-w-0 max-w-full">
          <span className="text-sm text-gray-300 break-all min-w-0">{!status ? 'Stato non disponibile' : status.connected ? `@${status.username}` : status.status === 'expired' ? 'Accesso scaduto' : 'Non collegato'}</span>
          <button type="button" className="btn btn-ghost btn-square" title="Aggiorna stato Instagram" aria-label="Aggiorna stato Instagram" disabled={busy} onClick={() => void perform()}><RefreshCw size={18} /></button>
        </div>
      </div>
      <p className="text-sm text-gray-400 mt-2">Ogni giorno legge le stories dell&apos;account professionale collegato e i post degli ultimi 7 giorni delle fonti Business/Creator autorizzate. Le stories di altri account non sono accessibili tramite le API ufficiali.</p>
      {error && <p role="alert" className="text-red-300 mt-4 break-words">{error}</p>}
      {notice && <p role="status" className="text-emerald-200 mt-4 break-words">{notice}</p>}
      {status?.lastError && <p className="text-amber-200 mt-3">{errorMessage(status.lastError)}</p>}
      {status && !status.configured && !status.connected && (
        <p className="text-amber-200 mt-4">Configurazione server mancante: imposta <code>INSTAGRAM_APP_ID</code>, <code>INSTAGRAM_APP_SECRET</code>, <code>INSTAGRAM_SCAN_ENCRYPTION_KEY</code> e un&apos;origine HTTPS (<code>NEXTAUTH_URL</code>) prima di collegare l&apos;account.</p>
      )}
      {status && status.configured && status.status === 'disconnected' && (
        <div className="flex flex-wrap gap-3 mt-5">{connectButton('Collega account Instagram')}</div>
      )}
      {status?.status === 'expired' && (
        <div className="flex flex-wrap gap-3 mt-5">
          {status.configured && connectButton('Ricollega account')}
          <button type="button" className="btn btn-outline" disabled={busy} onClick={() => void perform({ action: 'disconnect' })}><Unplug size={18} />Disconnetti</button>
        </div>
      )}
      {status?.connected && (
        <>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-gray-200 mt-5" aria-label="Stato connessione Instagram">
            <span className={expiresSoon ? 'text-amber-200' : ''}>Accesso valido fino al: {formatDate(status.tokenExpiresAt)}</span>
            <span>Ultima scansione: {formatDate(status.lastRunAt)}</span>
          </div>
          {status.lastRun && status.lastRunAt && (
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-gray-200 mt-2" aria-label="Conteggi ultima scansione Instagram">
              <span>Media analizzati: {status.lastRun.visited}</span><span>Pubblicati: {status.lastRun.published}</span>
              <span>Duplicati: {status.lastRun.duplicates}</span><span>Scartati: {status.lastRun.discarded}</span><span>Falliti: {status.lastRun.failed}</span>
            </div>
          )}
          {expiresSoon && <p className="text-amber-200 text-sm mt-2">L&apos;accesso scade a breve: ricollega l&apos;account per non interrompere la scansione.</p>}
          <ul className="mt-5 divide-y divide-white/10">
            {status.sources.map(source => (
              <li key={source.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0 flex-1 break-words"><p className="text-white font-medium">@{source.username}</p>
                  <p className="text-sm text-gray-400">{source.isActive && source.consentedAt ? 'Attiva' : 'In pausa'} · ultima lettura {formatDate(source.lastScannedAt)}</p>
                  {source.lastError && <p className="text-sm text-amber-200">{errorMessage(source.lastError)}</p>}
                </div>
                <div className="flex gap-1 shrink-0">
                  {source.isActive && source.consentedAt ? <button type="button" className="btn btn-ghost btn-square" title={`Metti in pausa @${source.username}`} aria-label={`Metti in pausa @${source.username}`} disabled={busy} onClick={() => void perform({ action: 'pause-source', sourceId: source.id })}><Pause size={18} /></button>
                    : <button type="button" className="btn btn-ghost btn-square" title={`Riattiva @${source.username}`} aria-label={`Riattiva @${source.username}`} disabled={busy} onClick={() => { setUsername(source.username); setConsent(false); }}><Play size={18} /></button>}
                  <button type="button" className="btn btn-ghost btn-square" title={`Rimuovi @${source.username}`} aria-label={`Rimuovi @${source.username}`} disabled={busy} onClick={() => void perform({ action: 'remove-source', sourceId: source.id })}><Trash2 size={18} /></button>
                </div>
              </li>
            ))}
          </ul>
          <form className="mt-5 space-y-4" onSubmit={event => { event.preventDefault(); void perform({ action: 'save-source', username, consent }); }}>
            <label className="text-sm text-gray-200 space-y-2 block"><span>Username Instagram (account Business o Creator)</span>
              <input aria-label="Username Instagram" type="text" autoComplete="off" spellCheck={false} pattern="@?[A-Za-z0-9._]{1,30}" maxLength={31} required value={username} disabled={busy} onChange={event => setUsername(event.target.value)}
                className="block w-full rounded-xl bg-white/10 border border-white/20 px-3 py-2 text-white" />
            </label>
            <label className="flex items-start gap-3 text-sm text-gray-200"><input type="checkbox" required checked={consent} disabled={busy} onChange={event => setConsent(event.target.checked)} className="checkbox checkbox-sm shrink-0" />
              <span>Autorizzo la ripubblicazione pubblica degli eventi e delle locandine di questo account e dichiaro di averne il diritto.</span>
            </label>
            <div className="flex flex-wrap gap-3 justify-between">
              <button className="btn btn-primary" disabled={busy || !consent || !username.trim()}><Plus size={18} />Verifica e aggiungi fonte</button>
              <button type="button" className="btn btn-outline" disabled={busy} onClick={() => void perform({ action: 'disconnect' })}><Unplug size={18} />Disconnetti</button>
            </div>
          </form>
        </>
      )}
    </section>
  );
}
