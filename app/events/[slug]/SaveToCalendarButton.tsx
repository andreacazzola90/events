'use client';

import { useState } from 'react';
import { toast } from 'react-toastify';

interface SaveToCalendarButtonProps {
    eventId: number;
}

export default function SaveToCalendarButton({ eventId }: SaveToCalendarButtonProps) {
    const [sending, setSending] = useState(false);

    const handleClick = async () => {
        setSending(true);
        try {
            const res = await fetch(`/api/events/${eventId}/calendar`, { method: 'POST' });
            const payload = await res.json().catch(() => ({}));
            if (!res.ok) {
                toast.error(payload?.error || 'Errore durante l\'invio al calendario');
                return;
            }
            toast.success(`Invito calendario inviato a ${payload.sentTo}`);
        } catch {
            toast.error('Problema di connessione, riprova.');
        } finally {
            setSending(false);
        }
    };

    return (
        <button
            type="button"
            onClick={handleClick}
            disabled={sending}
            className="inline-flex items-center justify-center px-4 py-2 rounded-full font-bold shadow-button bg-white/10 border border-white/30 text-white hover:bg-white/20 transition-all whitespace-nowrap disabled:opacity-50"
        >
            {sending ? 'Invio in corso…' : '📅 Salva nel calendario'}
        </button>
    );
}
