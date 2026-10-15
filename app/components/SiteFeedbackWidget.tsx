'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { LoaderCircle, MessageSquareText, Paperclip, Send, X } from 'lucide-react';

const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

export default function SiteFeedbackWidget() {
  const panelId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [attachment, setAttachment] = useState<File | null>(null);
  const [status, setStatus] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const widgetRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!widgetRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isOpen]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim() || !message.trim() || isSending) return;
    if (attachment && attachment.size > MAX_ATTACHMENT_BYTES) {
      setStatus({ kind: 'error', text: 'L’allegato deve pesare al massimo 5 MB.' });
      return;
    }

    setIsSending(true);
    setStatus(null);
    try {
      const formData = new FormData();
      formData.append('title', title);
      formData.append('message', message);
      if (attachment) formData.append('attachment', attachment);

      const response = await fetch('/api/site-feedback', { method: 'POST', body: formData });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Impossibile inviare la segnalazione.');

      setTitle('');
      setMessage('');
      setAttachment(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setStatus({ kind: 'success', text: 'Segnalazione inviata. Grazie!' });
    } catch (error) {
      setStatus({
        kind: 'error',
        text: error instanceof Error ? error.message : 'Impossibile inviare la segnalazione.',
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div ref={widgetRef} className="relative z-[900]">
      {isOpen && (
        <section
          id={panelId}
          aria-labelledby="site-feedback-title"
          className="fixed right-4 top-20 z-[900] max-h-[calc(100svh-6rem)] w-[min(24rem,calc(100vw-2rem))] overflow-y-auto border border-black/15 bg-white p-5 text-[#171717] shadow-[0_18px_48px_rgba(0,0,0,0.18)] sm:right-6"
        >
          <header className="mb-4 flex items-start justify-between gap-4 border-b border-black/10 pb-3">
            <div>
              <h2 id="site-feedback-title" className="mb-1 text-lg font-bold">Segnalazioni del sito eventi</h2>
              <p className="mb-0 text-sm text-black/60">La tua segnalazione sarà inviata all’amministratore.</p>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              aria-label="Chiudi segnalazione"
              className="flex h-9 w-9 shrink-0 items-center justify-center border border-black/15 text-black hover:bg-black hover:text-white"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </header>

          <form onSubmit={handleSubmit} className="space-y-3">
            <label className="block text-sm font-semibold">
              Titolo
              <input
                required
                maxLength={120}
                value={title}
                onChange={event => setTitle(event.target.value)}
                className="mt-1 w-full border border-black/20 bg-white px-3 py-2 text-sm font-normal focus:border-black focus:outline-none"
              />
            </label>
            <label className="block text-sm font-semibold">
              Messaggio
              <textarea
                required
                maxLength={5000}
                rows={5}
                value={message}
                onChange={event => setMessage(event.target.value)}
                className="mt-1 w-full resize-y border border-black/20 bg-white px-3 py-2 text-sm font-normal focus:border-black focus:outline-none"
              />
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-black/75 hover:text-black">
              <Paperclip className="h-4 w-4" aria-hidden="true" />
              {attachment ? attachment.name : 'Allega un file (facoltativo)'}
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp"
                onChange={event => setAttachment(event.target.files?.[0] || null)}
                className="sr-only"
              />
            </label>
            <p className="mb-0 text-xs text-black/50">PDF, JPEG, PNG o WebP · massimo 5 MB</p>
            {status && (
              <p role={status.kind === 'error' ? 'alert' : 'status'} className={`mb-0 text-sm ${status.kind === 'error' ? 'text-red-700' : 'text-green-800'}`}>
                {status.text}
              </p>
            )}
            <button
              type="submit"
              disabled={isSending || !title.trim() || !message.trim()}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 bg-[#171717] px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-[#d65a38] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" aria-hidden="true" />}
              {isSending ? 'Invio…' : 'Invia segnalazione'}
            </button>
          </form>
        </section>
      )}

      <button
        type="button"
        onClick={() => setIsOpen(open => !open)}
        aria-expanded={isOpen}
        aria-controls={panelId}
        aria-label={isOpen ? 'Chiudi segnalazioni' : 'Invia una segnalazione'}
        title={isOpen ? 'Chiudi segnalazioni' : 'Invia una segnalazione'}
        className="header-icon-control inline-flex h-11 w-11 items-center justify-center border border-black/20 bg-white text-[#171717] transition-colors"
      >
        {isOpen ? <X className="h-5 w-5" aria-hidden="true" /> : <MessageSquareText className="h-5 w-5" aria-hidden="true" />}
      </button>
    </div>
  );
}