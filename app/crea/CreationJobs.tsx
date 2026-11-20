'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AUTOPILOT_STOP_MESSAGES, type AutopilotStopReason } from '../../lib/event-autopilot';

const endpoint = '/api/event-creation-jobs';
const prefix = 'eventscanner:creation-job:';
const lifetime = 30 * 24 * 60 * 60 * 1000;
const hex = (bytes: Uint8Array) => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
type LocalJob = { id: string; secret: string; digest: string; createdAt: number; accepted?: boolean };
type JobStatus = {
  id: string;
  status: 'queued' | 'processing' | 'review' | 'failed' | 'published';
  canReview?: boolean;
  reason?: string;
  events?: { index: number; status: string; slug?: string }[];
};

function localJobs(): LocalJob[] {
  const jobs: LocalJob[] = [];
  try {
    const keys = Object.keys(localStorage).filter(key => key.startsWith(prefix));
    for (const key of keys) {
      try {
        const job = JSON.parse(localStorage.getItem(key)!) as LocalJob;
        if (Date.now() - job.createdAt >= lifetime) localStorage.removeItem(key);
        else jobs.push(job);
      } catch {
        continue;
      }
    }
  } catch {
    // Signed-in clients can still retrieve their jobs from the server.
  }
  return jobs.sort((a, b) => b.createdAt - a.createdAt).slice(0, 20);
}

export async function uploadCreationJob(file: File) {
  if (file.size > 4 * 1024 * 1024) throw new Error('Per la pubblicazione in background scegli un’immagine fino a 4 MB, oppure disattiva la pubblicazione automatica.');
  const digest = hex(new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer())));
  const job = localJobs().find(item => item.digest === digest) ?? {
    id: crypto.randomUUID(), secret: hex(crypto.getRandomValues(new Uint8Array(32))), digest, createdAt: Date.now(),
  };
  const key = prefix + job.id;
  try {
    // Save before sending: the server can commit even if the response never reaches this tab.
    localStorage.setItem(key, JSON.stringify(job));
  } catch {
    throw new Error('Questa finestra non può conservare la ricevuta. Disattiva la pubblicazione automatica per continuare in modalità manuale.');
  }
  let response: Response;
  try {
    response = await fetch(endpoint, { method: 'POST', headers: {
      'Content-Type': file.type || 'application/octet-stream',
      'Idempotency-Key': job.id, 'X-Event-Job-Secret': job.secret,
    }, body: file, signal: AbortSignal.timeout(45_000) });
  } catch {
    throw new Error('Ricezione non confermata. Controlla la sezione Invii in background oppure seleziona di nuovo la stessa immagine.');
  }
  const result = await response.json().catch(() => null);
  if (response.status !== 202 || result?.id !== job.id) {
    // A changed account cannot resume the previous owner's receipt. A new selection can start a new job.
    if (response.status >= 400 && response.status < 500) localStorage.removeItem(key);
    throw new Error(result?.error || 'Ricezione non confermata. Riprova con la stessa immagine.');
  }
  try {
    localStorage.setItem(key, JSON.stringify({ ...job, accepted: true }));
  } catch {
    // The pre-request record is enough to resume.
  }
  return result as JobStatus;
}

const messages: Record<JobStatus['status'], string> = {
  queued: 'File ricevuto, evento in elaborazione.',
  processing: 'File ricevuto, evento in elaborazione.',
  review: 'Revisione necessaria. Nessun evento pubblicato.',
  failed: 'Elaborazione non riuscita. Nessun evento pubblicato.',
  published: 'Pubblicazione completata.',
};

export default function CreationJobs({ update, onReview }: { update: number; onReview: (file: File) => void }) {
  const [jobs, setJobs] = useState<JobStatus[]>([]);
  const [statusUnavailable, setStatusUnavailable] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const statuses = new Map<string, JobStatus>();
    let timer: ReturnType<typeof setTimeout>;
    let ownerIds: string[] | undefined;
    let interval = 3_000;
    async function poll() {
      const local = localJobs();
      const options = { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8_000)]), cache: 'no-store' as const };
      if (!ownerIds) {
        try {
          const response = await fetch(endpoint, options);
          if (response.ok) ownerIds = (await response.json()).jobs.map((job: { id: string }) => job.id);
        } catch { /* Retry with the status requests. */ }
      }
      const ids = [...new Set([...local.map(job => job.id), ...ownerIds ?? []])];
      let failed = false;
      let unresolved = false;
      await Promise.all(ids.map(async id => {
        const previous = statuses.get(id);
        if (previous && !['queued', 'processing'].includes(previous.status)) return;
        const receipt = local.find(item => item.id === id);
        const headers = receipt ? { 'X-Event-Job-Secret': receipt.secret } : undefined;
        try {
          const response = await fetch(`${endpoint}/${id}`, { ...options, headers });
          if (response.ok) statuses.set(id, await response.json());
          else if (response.status === 404) {
            if (previous) statuses.delete(id);
            if (receipt && !receipt.accepted && Date.now() - receipt.createdAt < 60_000) unresolved = true;
          } else failed = true;
        } catch { failed = true; }
      }));
      if (controller.signal.aborted) return;
      setJobs(ids.flatMap(id => statuses.get(id) ?? []));
      setStatusUnavailable(failed);
      if (failed || unresolved || !ownerIds || [...statuses.values()].some(job => ['queued', 'processing'].includes(job.status))) {
        timer = setTimeout(poll, interval);
        interval = Math.min(20_000, interval + 1_000);
      }
    }
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [update]);

  async function review(id: string) {
    setReviewError(false);
    setLoadingId(id);
    try {
      const secret = localJobs().find(job => job.id === id)?.secret;
      const response = await fetch(`${endpoint}/${id}?input=1`, {
        headers: secret ? { 'X-Event-Job-Secret': secret } : undefined, cache: 'no-store', signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error('input unavailable');
      const file = await response.blob();
      onReview(new File([file], `locandina.${file.type.split('/')[1] || 'jpg'}`, { type: file.type }));
    } catch {
      setReviewError(true);
    } finally {
      setLoadingId(null);
    }
  }

  if (!jobs.length && !statusUnavailable) return null;
  return (
    <section id="invii-in-background" className="surface-panel p-6 space-y-3" aria-labelledby="job-status-heading">
      <h2 id="job-status-heading" className="text-xl font-bold">Invii in background</h2>
      {statusUnavailable && <p role="status">Aggiornamento temporaneamente non disponibile. Riproviamo tra poco.</p>}
      {reviewError && <p role="alert">La locandina non è più disponibile. Puoi ricaricarla con la pubblicazione automatica disattivata.</p>}
      <ul className="space-y-4">
        {jobs.map(job => (
          <li key={job.id} className="space-y-2 border-b border-[var(--line)] pb-3 last:border-0">
            <p role="status" data-testid="creation-job-status">{messages[job.status]}</p>
            {job.status === 'review' && job.reason && (
              <p>{AUTOPILOT_STOP_MESSAGES[job.reason as AutopilotStopReason] ?? 'Controlla i dati e la copertina prima di pubblicare.'}</p>
            )}
            {job.events?.flatMap(({ slug, index }) => slug ? [
              <Link key={index} className="mr-3 underline" href={`/events/${slug}`}>Apri evento {index + 1}</Link>,
            ] : [])}
            {job.canReview && (
              <button type="button" className="btn btn-outline btn-sm" disabled={loadingId !== null} onClick={() => void review(job.id)}>
                {loadingId === job.id ? 'Carico la locandina…' : 'Rivedi manualmente'}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
