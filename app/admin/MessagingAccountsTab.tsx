'use client';

import { useEffect, useRef, useState } from 'react';
import { LogOut, Pause, RefreshCw, Link as LinkIcon, Check } from 'lucide-react';
import type { Platform, MessagingCommand } from '../../lib/personal-messaging';
import ServiceScanControls from './ServiceScanControls';

type Source = { id: string; title: string; kind: string; reference?: string; active?: boolean; consentedAt?: string; groupType?: string };
type ScanState = { sourceId: string; active: boolean; backlog: number; lastScannedAt?: string; lastError?: string; messagesSeen: number; messagesDiscarded: number };
type Account = { platform: Platform; status: string; connectionVerified?: boolean; error?: string; qr?: string; qrExpiresAt?: number; expiresAt?: number; remoteRemoved?: boolean; listing: string; sources: Source[]; availableSources?: Source[]; availableSourcesTruncated?: boolean; scanning?: ScanState[] };
const labels: Record<string, string> = { disconnected: 'Non collegato', connecting: 'Collegamento in corso', code: 'Codice richiesto', password: 'Verifica 2FA richiesta', qr: 'Scansione QR richiesta', connected: 'Collegato', restoring: 'Ripristino in corso', expired: 'Accesso scaduto' };
const errors: Record<string, string> = {
  worker_unavailable: 'Servizio non disponibile. Configurare o riattivare il worker personale.',
  encryption_unavailable: 'Chiave di cifratura del worker non configurata.',
  telegram_configuration_missing: 'Configurare API ID e API hash Telegram nel worker.',
  provider_unavailable: 'Provider non disponibile. Verificare configurazione e stato del servizio.',
  code_invalid: 'Codice non valido. Riprova.', code_expired: 'Codice scaduto. Avvia un nuovo collegamento.',
  password_invalid: 'Password 2FA non valida. Riprova.', login_expired: 'Accesso scaduto. Avvia un nuovo collegamento.',
  rate_limited: 'Troppi tentativi. Attendi prima di riprovare.', invalid_phone: 'Inserisci il telefono con prefisso internazionale.',
  source_unavailable: 'Canale non accessibile, protetto o non supportato. Nessuna autorizzazione salvata.',
  telegram_flood_wait: 'Telegram ha imposto un limite temporaneo. La scansione riprovera al prossimo cron.',
  personal_telegram_processing_failed: 'Annuncio non elaborato; il job verra ritentato entro i limiti previsti.',
  personal_telegram_ocr_failed: 'Lettura locale della locandina non riuscita; il job verra ritentato entro i limiti previsti.',
  source_limit: 'Limite di 50 fonti raggiunto.', consent_required: 'Conferma i diritti per questa fonte.',
  not_connected: 'Account non collegato.', operation_cancelled: 'Operazione annullata da una revoca o da un nuovo accesso.',
  session_corrupt: 'Sessione non leggibile. Richiesto intervento sul worker.', invalid_origin: 'Origine della richiesta non valida.',
};
export function PlatformAccount({ platform }: { platform: Platform }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [phone, setPhone] = useState('');
  const [credential, setCredential] = useState('');
  const [source, setSource] = useState('');
  const [consent, setConsent] = useState(false);
  const [query, setQuery] = useState('');
  const [available, setAvailable] = useState<Source[]>([]);
  const busyRef = useRef(false);
  const version = useRef(0);
  const alive = useRef(true);
  const refreshing = useRef<AbortController | null>(null);
  const status = useRef<string | undefined>(undefined);
  const [clock, setClock] = useState(() => Date.now());
  const [verified, setVerified] = useState(false);

  function accept(result: Account) {
    if (status.current !== result.status) setCredential('');
    status.current = result.status;
    setAccount(result);
  }
  function unavailable() {
    setVerified(false);
    status.current = undefined;
    setAccount(null); setCredential(''); setPhone(''); setSource(''); setConsent(false); setAvailable([]); setQuery('');
  }

  useEffect(() => {
    alive.current = true;
    const controller = new AbortController();
    const refresh = async () => {
      if (busyRef.current || refreshing.current) return;
      const request = new AbortController(); refreshing.current = request;
      const current = ++version.current;
      try {
        const response = await fetch(`/api/admin/messaging?platform=${platform}`, { cache: 'no-store', signal: AbortSignal.any([controller.signal, request.signal, AbortSignal.timeout(14000)]) });
        const result = await response.json();
        if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? 'Accesso admin richiesto.' : errors[result.error] || errors.worker_unavailable);
        if (alive.current && current === version.current) { accept(result); setError(''); if (!['code', 'password'].includes(result.status)) setCredential(''); }
      } catch { if (alive.current && !controller.signal.aborted && !request.signal.aborted && current === version.current) { unavailable(); setError(errors.worker_unavailable); } }
      finally { if (refreshing.current === request) refreshing.current = null; }
    };
    void refresh();
    const interval = setInterval(() => { setClock(Date.now()); void refresh(); }, 3000);
    return () => { alive.current = false; version.current++; controller.abort(); refreshing.current?.abort(); refreshing.current = null; clearInterval(interval); };
  }, [platform]);

  async function command(action: MessagingCommand['action'], extra: Partial<MessagingCommand> = {}) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError('');
    setVerified(false);
    const current = ++version.current;
    refreshing.current?.abort(); refreshing.current = null;
    const body = JSON.stringify({ action, platform, ...extra });
    setCredential(''); setPhone('');
    try {
      const response = await fetch('/api/admin/messaging', { method: 'POST', headers: { 'content-type': 'application/json' }, body, signal: AbortSignal.timeout(14000) });
      const result = await response.json();
      if (!response.ok) {
        if (alive.current && current === version.current && (response.status >= 500 || response.status === 401 || response.status === 403)) unavailable();
        throw new Error(response.status === 401 || response.status === 403 ? 'Accesso admin richiesto.' : errors[result.error] || errors.worker_unavailable);
      }
      if (alive.current && current === version.current) {
        accept(result);
        if (action === 'status' && result.status === 'connected') {
          setVerified(result.connectionVerified === true);
          if (!result.connectionVerified) setError('Connessione non verificata: servizio occupato. Riprova dopo la scansione.');
        }
        if (result.availableSources) setAvailable(result.availableSources);
        if (action === 'authorize') { setSource(''); setConsent(false); }
        if (action === 'disconnect' || action === 'start') { setAvailable([]); setConsent(false); setSource(''); }
      }
    } catch (failure) { if (alive.current && current === version.current) { if (!(failure instanceof Error) || !Object.values(errors).includes(failure.message)) unavailable(); setError(failure instanceof Error && Object.values(errors).includes(failure.message) ? failure.message : errors.worker_unavailable); } }
    finally { busyRef.current = false; if (alive.current) setBusy(false); }
  }
  const connected = account?.status === 'connected';
  const candidates = available.filter(item => `${item.title} ${item.id} ${item.reference || ''}`.toLowerCase().includes(query.toLowerCase()));
  const selectedSourceKind = available.find(item => item.id === source || item.reference === source)?.kind || (source.startsWith('group:') ? 'group' : undefined);
  const qrVisible = account?.qr && account.qrExpiresAt && account.qrExpiresAt > clock;
  const name = platform === 'telegram' ? 'Telegram' : 'WhatsApp';
  return (
    <section className="space-y-5 min-w-0 sentry-block" data-sentry-block data-testid="messaging-account" aria-label={`Account personale ${name}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold text-white" style={{ fontSize: 18, lineHeight: '24px', letterSpacing: 0, margin: 0 }}>Account personale {name}</h2>
        <button type="button" className="btn btn-ghost btn-sm" title="Verifica connessione" aria-label="Aggiorna stato" disabled={busy} onClick={() => void command('status')}><RefreshCw size={18} />Verifica connessione</button>
      </div>
      <p role="status" aria-live="polite" className="text-sm text-gray-200">{busy ? 'Operazione in corso' : account ? labels[account.status] || 'Non disponibile' : 'Servizio non disponibile'}</p>
      {(error || account?.error) && <p role="alert" className="text-sm text-red-300 break-words">{error || errors[account?.error || ''] || errors.worker_unavailable}</p>}
      {verified && connected && <p role="status">Connessione verificata presso il provider.</p>}
      {platform === 'whatsapp' && <p className="text-sm text-amber-200">Client non ufficiale: WhatsApp puo limitare o bloccare l&apos;account. La sincronizzazione tecnica del protocollo non puo essere eliminata del tutto; le conversazioni non vengono conservate.</p>}
      {account && !connected && <form className="flex flex-wrap items-end gap-3" onSubmit={event => { event.preventDefault(); void command('start', platform === 'telegram' ? { phone } : {}); }}>
        {platform === 'telegram' && <label className="text-sm text-gray-200 min-w-0 w-full sm:w-72">Telefono internazionale<input className="input input-bordered w-full mt-1" type="tel" autoComplete="off" aria-label="Telefono internazionale" value={phone} onChange={event => setPhone(event.target.value)} placeholder="+39..." maxLength={16} disabled={busy} /></label>}
        <button className="btn btn-primary btn-sm" type="submit" disabled={busy || (platform === 'telegram' && !/^\+[1-9]\d{6,14}$/.test(phone))}><LinkIcon size={16} />{account.status === 'disconnected' || account.status === 'expired' ? 'Collega account' : 'Nuovo collegamento'}</button>
      </form>}
      {account && ['code', 'password'].includes(account.status) && <form className="flex flex-wrap items-end gap-3" onSubmit={event => { event.preventDefault(); void command(account.status === 'code' ? 'code' : 'password', account.status === 'code' ? { code: credential } : { password: credential }); }}>
        <label className="text-sm text-gray-200 min-w-0 w-full sm:w-72">{account.status === 'code' ? 'Codice Telegram' : 'Password 2FA'}<input className="input input-bordered w-full mt-1" aria-label={account.status === 'code' ? 'Codice Telegram' : 'Password 2FA'} type="password" autoComplete="off" maxLength={256} value={credential} onChange={event => setCredential(event.target.value)} disabled={busy} /></label>
        <button className="btn btn-primary btn-sm" type="submit" disabled={busy || !credential}><Check size={16} />Conferma</button>
      </form>}
      {account?.status === 'qr' && <div className="space-y-2">
        {qrVisible ? <><img src={account.qr} alt="QR temporaneo per collegare il proprio account WhatsApp" width={256} height={256} className="max-w-full" /><p className="text-xs text-gray-300">Scade alle {new Date(account.qrExpiresAt!).toLocaleTimeString('it-IT')}</p></> : <p className="text-sm text-amber-200">QR scaduto. Richiedi un nuovo collegamento.</p>}
      </div>}
      {connected && <div className="space-y-4 border-t border-white/10 pt-4">
        <p className="text-sm text-gray-300">{platform === 'whatsapp'
          ? 'Elenco dei canali seguiti non supportato. Verifica un link o ID newsletter.'
          : 'Elenco metadati di gruppi/supergruppi gia frequentati e canali pubblici amministrati; anteprime escluse. Nuovi annunci sono controllati dal cron giornaliero (18:00 UTC). Le locandine vengono lette localmente; ai provider esterni arriva solo testo filtrato, mai foto o conversazioni.'}</p>
        <div className="flex flex-wrap gap-3 items-center"><button className="btn btn-ghost btn-sm" type="button" disabled={busy} onClick={() => void command('sources')}><RefreshCw size={16} />Aggiorna gruppi e canali</button><input className="input input-bordered min-w-0 w-full sm:w-64" aria-label="Cerca gruppi e canali" placeholder="Cerca gruppi e canali" value={query} onChange={event => setQuery(event.target.value)} /></div>
        {account.availableSourcesTruncated && <p role="status" className="text-sm text-amber-200">Elenco limitato ai primi 500 dialoghi (massimo 500 gruppi) e a 100 canali pubblici amministrati. Se il gruppo non compare, aggiorna l&apos;elenco dopo aver ridotto le altre conversazioni.</p>}
        {candidates.length > 0 && <ul className="divide-y divide-white/10">{candidates.map(item => <li key={item.id} className="flex flex-wrap items-center gap-2 py-2"><span className="break-all text-sm text-gray-200 flex-1 min-w-0">{item.title}</span><button className="btn btn-ghost btn-sm" type="button" disabled={busy} onClick={() => { setSource(item.reference || item.id); setConsent(false); }}>Seleziona</button></li>)}</ul>}
        <form className="space-y-3" onSubmit={event => { event.preventDefault(); void command('authorize', { source, consent }); }}>
          <label className="block text-sm text-gray-200">{platform === 'whatsapp' ? 'Link o ID newsletter' : 'Gruppo, supergruppo o canale da autorizzare'}<input className="input input-bordered w-full mt-1" aria-label="Fonte da autorizzare" value={source} maxLength={200} onChange={event => { setSource(event.target.value); setConsent(false); }} disabled={busy} autoComplete="off" /></label>
          <label className="flex gap-2 items-start text-sm text-gray-200"><input type="checkbox" className="checkbox checkbox-sm shrink-0" checked={consent} onChange={event => setConsent(event.target.checked)} disabled={busy} />{platform === 'telegram' && selectedSourceKind === 'group'
            ? 'Acconsento alla lettura dei soli nuovi annunci pubblici di eventi e alla loro estrazione assistita e pubblicazione automatica; non saranno elaborati messaggi personali.'
            : platform === 'whatsapp' ? 'Autorizzo la lettura, estrazione e pubblicazione dei soli nuovi annunci pubblici di eventi dalla newsletter; confermo di avere i diritti alla ripubblicazione.' : 'Confermo di avere i diritti per la futura importazione e ripubblicazione da questa fonte.'}</label>
          <button type="submit" className="btn btn-primary btn-sm max-w-full whitespace-normal h-auto min-h-8 py-2" disabled={busy || !consent || !source}><Check size={16} className="shrink-0" />Verifica e autorizza fonte</button>
        </form>
      </div>}
      {account && account.sources.length > 0 && <ul className="divide-y divide-white/10 border-t border-white/10">{account.sources.map(item => <li key={item.id} className="flex flex-wrap gap-3 py-3 items-center">
        <div className="flex-1 min-w-0 text-sm"><p className="text-white break-words">{item.title}</p><p className="text-gray-400">{item.kind === 'group' ? (item.groupType === 'basic' ? 'Gruppo' : 'Supergruppo') : item.reference || 'Canale'}</p><p className="text-gray-300">{item.active ? ['group', 'newsletter'].includes(item.kind) ? 'Scansione e pubblicazione autorizzate' : 'Autorizzata per uso futuro' : 'In pausa'}</p>
          {(() => { const scan = account.scanning?.find(state => state.sourceId === item.id); return scan && <p className="text-xs text-gray-400">Coda: {scan.backlog} · esaminati: {scan.messagesSeen} · scartati: {scan.messagesDiscarded}{scan.lastScannedAt ? ` · ultima scansione ${new Date(scan.lastScannedAt).toLocaleString('it-IT')}` : ''}{scan.lastError ? ` · ${errors[scan.lastError] || 'Scansione temporaneamente non disponibile'}` : ''}</p>; })()}
        </div>
        {item.active && <button className="btn btn-ghost btn-sm" type="button" title={`Metti in pausa ${item.title}`} aria-label={`Metti in pausa ${item.title}`} disabled={busy} onClick={() => void command('pause', { source: item.id })}><Pause size={18} /></button>}
      </li>)}</ul>}
      {platform === 'whatsapp' && <p className="text-sm text-gray-300">Solo newsletter autorizzate e nuovi messaggi dalla baseline. Nessuna iscrizione automatica o lettura delle chat. Elaborati testo e didascalie; immagini senza testo non supportate. Nessuna pianificazione automatica.</p>}
      <ServiceScanControls endpoint="/api/admin/messaging/run" platform={platform} disabled={busy || !connected || !account?.sources.some(item => item.active && item.consentedAt && item.kind === (platform === 'telegram' ? 'group' : 'newsletter'))} />
      {account && account.status !== 'disconnected' && <button className="btn btn-ghost btn-sm text-red-300" type="button" disabled={busy} onClick={() => void command('disconnect')}><LogOut size={16} />Disconnetti</button>}
      {account?.remoteRemoved === false && <p role="status" className="text-sm text-amber-200">Accesso locale rimosso. Logout remoto non confermato: revoca il dispositivo dall&apos;app del provider.</p>}
    </section>
  );
}
export default function MessagingAccountsTab() {
  const [platform, setPlatform] = useState<Platform>('telegram');
  return <div className="space-y-5 min-w-0"><div className="flex gap-2 border-b border-white/10" role="tablist" aria-label="Piattaforma account personale" onKeyDown={event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 'telegram' : event.key === 'End' ? 'whatsapp' : platform === 'telegram' ? 'whatsapp' : 'telegram';
    setPlatform(next); event.currentTarget.querySelector<HTMLButtonElement>(`#messaging-tab-${next}`)?.focus();
  }}>{(['telegram', 'whatsapp'] as const).map(item => <button key={item} id={`messaging-tab-${item}`} aria-controls="messaging-platform-panel" tabIndex={platform === item ? 0 : -1} type="button" role="tab" aria-selected={platform === item} className={`px-3 py-2 text-sm border-b-2 ${platform === item ? 'text-white border-white' : 'text-gray-400 border-transparent'}`} onClick={() => setPlatform(item)}>{item === 'telegram' ? 'Telegram' : 'WhatsApp'}</button>)}</div><div id="messaging-platform-panel" role="tabpanel" aria-labelledby={`messaging-tab-${platform}`}><PlatformAccount key={platform} platform={platform} /></div></div>;
}