'use client';

import { useEffect, useRef, useState } from 'react';

const counts: Record<string, string> = {
  sources: 'Fonti', visited: 'Letti', queued: 'In coda', wouldPublish: 'Candidati da pubblicare',
  published: 'Pubblicati', duplicates: 'Duplicati', discarded: 'Scartati', failed: 'Errori',
  retried: 'Da ritentare', deferred: 'Rinviati', imageOmitted: 'Immagini omesse', ocrErrors: 'Errori OCR',
};
export default function ServiceScanControls({ endpoint, platform, disabled = false }: { endpoint: string; platform?: 'telegram' | 'whatsapp'; disabled?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function run(dryRun: boolean) {
    if (controller.current) return;
    const request = new AbortController(); controller.current = request;
    setBusy(true); setError(''); setReport(null);
    try {
      const response = await fetch(endpoint, { method: 'POST', cache: 'no-store', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ dryRun, ...(platform ? { platform } : {}) }), signal: AbortSignal.any([request.signal, AbortSignal.timeout(280_000)]) });
      const data: unknown = await response.json();
      if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? 'Accesso admin richiesto o origine non valida.' : response.status === 429 ? 'Scansione gia in corso. Riprova piu tardi.' : 'Scansione non riuscita. Verifica connessione e fonti.');
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Resoconto non valido.');
      if (!request.signal.aborted) setReport(data as Record<string, unknown>);
    } catch (failure) {
      if (!request.signal.aborted) setError(failure instanceof Error && failure.name !== 'TimeoutError' ? failure.message : 'Tempo disponibile esaurito. Il risultato potrebbe essere parziale: aggiorna lo stato prima di riprovare.');
    } finally { controller.current = null; if (!request.signal.aborted) setBusy(false); }
  }
  return <section aria-label="Comandi scraping" className="space-y-3 my-4" aria-busy={busy}>
    <div className="flex flex-wrap gap-3">
      <button type="button" className="btn btn-outline" disabled={disabled || busy} onClick={() => void run(true)}>Prova senza pubblicare</button>
      <button type="button" className="btn btn-primary" disabled={disabled || busy} onClick={() => void run(false)}>Avvia scraping</button>
    </div>
    <p className="text-sm text-gray-300">Solo questo servizio e il tuo account. La prova non pubblica e non avanza i cursori.</p>
    {busy && <p role="status">Scansione in corso…</p>}
    {error && <p role="alert">{error}</p>}
    {report && <div role="status" aria-live="polite">
      <p>{report.dryRun ? 'Prova completata, nessuna pubblicazione.' : 'Scansione completata.'}{['partial', 'partial-error'].includes(String(report.status)) ? ' Risultato parziale: alcuni elementi non sono stati elaborati.' : ''}</p>
      <dl className="flex flex-wrap gap-4">{Object.entries(counts).map(([key, label]) => typeof report[key] === 'number' && <div key={key}><dt>{label}</dt><dd>{String(report[key])}</dd></div>)}</dl>
    </div>}
  </section>;
}
