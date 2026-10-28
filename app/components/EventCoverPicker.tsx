'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, ExternalLink, Loader2, RefreshCw, X } from 'lucide-react';
import type { CoverCandidate } from '../../lib/event-cover';
import { MAX_EVENT_MEDIA_BYTES } from '../../lib/event-media';
import { fetchDraftCover } from '../../lib/draft-image-crop';

type Props = {
    title: string;
    date: string;
    location: string;
    onSelect: (image: Blob) => void;
};

export default function EventCoverPicker({ title, date, location, onSelect }: Props) {
    const [candidates, setCandidates] = useState<Array<CoverCandidate & { displayUrl?: string; ready?: boolean; failed?: boolean }>>([]);
    const [status, setStatus] = useState('loading');
    const [selected, setSelected] = useState<string>();
    const [error, setError] = useState('');
    const [attempt, setAttempt] = useState(0);
    const [dismissed, setDismissed] = useState(false);
    const requests = useRef<AbortController | null>(null);
    const previews = useRef(new Map<string, Blob>());

    useEffect(() => {
        const controller = new AbortController();
        requests.current = controller;
        const previewUrls: string[] = [];
        previews.current.clear();
        setCandidates([]);
        setSelected(undefined);
        setStatus('loading');
        setError('');
        setDismissed(false);
        void (async () => {
            try {
                const response = await fetchDraftCover('/api/event-cover-search', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title: title.slice(0, 160), date: date.slice(0, 40), location: location.slice(0, 160) }),
                    signal: controller.signal,
                }, 25_000);
                if (!response.ok) throw new Error('Search unavailable');
                const result = await response.json();
                if (controller.signal.aborted) return;
                const found: CoverCandidate[] = Array.isArray(result.candidates) ? result.candidates.slice(0, 5) : [];
                setCandidates(found);
                setStatus(result.status === 'not-configured' ? 'not-configured' : result.status === 'failed' ? 'failed' : 'completed');
                await Promise.all(found.map(async candidate => {
                    try {
                        if (!candidate.previewUrl.startsWith('/api/event-cover-image?token=')) throw new Error('Invalid image');
                        const image = await fetchDraftCover(candidate.previewUrl, { signal: controller.signal }, 15_000);
                        if (!image.ok) throw new Error('Image unavailable');
                        const blob = await image.blob();
                        if (controller.signal.aborted) return;
                        if (blob.type !== 'image/jpeg' || !blob.size || blob.size > MAX_EVENT_MEDIA_BYTES) throw new Error('Invalid image');
                        const displayUrl = URL.createObjectURL(blob);
                        previewUrls.push(displayUrl);
                        previews.current.set(candidate.id, blob);
                        setCandidates(current => current.map(item => item.id === candidate.id ? { ...item, displayUrl } : item));
                    } catch {
                        if (controller.signal.aborted) return;
                        setCandidates(current => current.map(item => item.id === candidate.id ? { ...item, failed: true } : item));
                        setError('Alcune immagini non sono disponibili. Puoi ripetere la ricerca.');
                    }
                }));
            } catch {
                if (!controller.signal.aborted) setStatus('failed');
            }
        })();
        return () => {
            controller.abort();
            previewUrls.forEach(url => URL.revokeObjectURL(url));
            previews.current.clear();
        };
    }, [title, date, location, attempt]);

    const applySelection = () => {
        const blob = selected && candidates.find(candidate => candidate.id === selected && candidate.ready)
            ? previews.current.get(selected) : undefined;
        if (blob) onSelect(blob);
    };

    if (dismissed) return null;

    return (
        <section className="border-t border-black/10 p-4" aria-label="Immagini dal web" data-cover-picker>
            <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-[#1d1d1b]">Immagini dal web</h3>
                <button type="button" title="Ripeti ricerca immagini" aria-label="Ripeti ricerca immagini" disabled={status === 'loading'}
                    onClick={() => setAttempt(value => value + 1)} className="flex h-8 w-8 shrink-0 items-center justify-center border border-black/20 disabled:opacity-40">
                    <RefreshCw className="h-4 w-4" aria-hidden="true" />
                </button>
            </div>
            <div role="status" aria-live="polite" className="text-sm text-[#5f5b56]">
                {status === 'loading' && <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Ricerca immagini...</span>}
                {status === 'not-configured' && 'Ricerca web non configurata.'}
                {status === 'failed' && 'Ricerca immagini non disponibile.'}
                {status === 'completed' && !candidates.length && 'Nessuna immagine trovata.'}
            </div>
            {candidates.length > 0 && (
                <>
                    <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Copertine trovate">
                        {candidates.map(candidate => (
                            <div key={candidate.id} className="min-w-0">
                                <label className={`relative block cursor-pointer border-2 ${selected === candidate.id ? 'border-[#b84b2d]' : 'border-black/15'}`}>
                                    <input type="radio" name="web-cover" value={candidate.id} checked={selected === candidate.id}
                                        disabled={!candidate.ready} onChange={() => setSelected(candidate.id)}
                                        aria-label={`Seleziona immagine da ${new URL(candidate.sourceUrl).hostname}`} className="absolute left-2 top-2 h-4 w-4 accent-[#b84b2d]" />
                                    {candidate.displayUrl && !candidate.failed ? <img src={candidate.displayUrl} alt={candidate.title} referrerPolicy="no-referrer"
                                        className="h-36 w-full bg-[#f3f4f4] object-contain"
                                        onLoad={() => setCandidates(current => current.map(item => item.id === candidate.id ? { ...item, ready: true } : item))}
                                        onError={() => {
                                            previews.current.delete(candidate.id);
                                            setCandidates(current => current.map(item => item.id === candidate.id ? { ...item, failed: true, ready: false } : item));
                                            setSelected(current => current === candidate.id ? undefined : current);
                                        }} /> : <div className="flex h-36 w-full items-center justify-center bg-[#f3f4f4] p-2 text-center text-xs text-[#5f5b56]">
                                            {candidate.failed ? 'Immagine non disponibile' : <Loader2 className="h-5 w-5 animate-spin" aria-label="Caricamento anteprima" />}
                                        </div>}
                                </label>
                                <a href={candidate.sourceUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer"
                                    className="mt-1 flex min-w-0 items-center gap-1 text-xs text-[#5f5b56] underline underline-offset-2">
                                    <span className="truncate">{new URL(candidate.sourceUrl).hostname.replace(/^www\./, '')}</span>
                                    <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
                                </a>
                            </div>
                        ))}
                    </div>
                    <button type="button" disabled={!selected} onClick={applySelection}
                        className="mt-3 flex min-h-10 w-full items-center justify-center gap-2 border border-[#1d1d1b] bg-[#1d1d1b] px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">
                        <Check className="h-4 w-4" aria-hidden="true" />Usa immagine
                    </button>
                </>
            )}
            {error && <p role="alert" className="mt-2 text-sm text-[#8f3823]">{error}</p>}
            <button type="button" onClick={() => { requests.current?.abort(); setDismissed(true); }}
                className="mt-3 flex min-h-9 w-full items-center justify-center gap-2 text-sm text-[#5f5b56] underline underline-offset-4">
                <X className="h-4 w-4" aria-hidden="true" />Senza copertina
            </button>
        </section>
    );
}