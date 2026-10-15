'use client';

import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { Heart } from 'lucide-react';

interface FavoriteButtonProps {
    eventId: number;
    initialIsFavorite?: boolean;
    onToggle?: (newValue: boolean) => void;
}

export default function FavoriteButton({ eventId, initialIsFavorite, onToggle }: FavoriteButtonProps) {
    const [isFavorite, setIsFavorite] = useState(initialIsFavorite ?? false);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        // Mantieni lo stato locale allineato con il valore iniziale passato dal parent
        if (initialIsFavorite !== undefined) {
            setIsFavorite(initialIsFavorite);
        }
    }, [initialIsFavorite]);

    useEffect(() => {
        // Se il parent fornisce un valore iniziale (anche false), non fare fetch extra
        if (initialIsFavorite !== undefined) {
            return;
        }

        let cancelled = false;
        (async () => {
            try {
                const res = await fetch('/api/favorites', { cache: 'no-store' });
                if (!res.ok) {
                    return;
                }
                const data: { id: number }[] = await res.json();
                if (!cancelled) {
                    setIsFavorite(data.some(e => e.id === eventId));
                }
            } catch {
                // Ignora errori silenziosamente
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [eventId, initialIsFavorite]);

    const toggleFavorite = async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (loading) return;
        setLoading(true);

        try {
            const method = isFavorite ? 'DELETE' : 'POST';
            const res = await fetch('/api/favorites', {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ eventId }),
            });

            if (res.status === 401) {
                // Non autenticato: manda alla pagina di login
                toast.info('Effettua il login per usare i preferiti');
                window.location.href = '/auth';
                return;
            }

            if (res.ok) {
                const nextValue = !isFavorite;
                setIsFavorite(nextValue);
                if (onToggle) {
                    onToggle(nextValue);
                }
                if (nextValue) {
                    toast.success('Aggiunto ai preferiti');
                } else {
                    toast.info('Rimosso dai preferiti');
                }
            } else {
                toast.error('Errore durante l\'aggiornamento dei preferiti');
            }
        } catch {
            toast.error('Errore di rete durante l\'aggiornamento dei preferiti');
        } finally {
            setLoading(false);
        }
    };

    return (
        <button
            onClick={toggleFavorite}
            type="button"
            aria-label={isFavorite ? 'Rimuovi dai preferiti' : 'Aggiungi ai preferiti'}
            aria-pressed={isFavorite}
            className="absolute top-3 right-3 z-10 bg-transparent text-black flex items-center justify-center"
            disabled={loading}
        >
            <Heart
                className={`h-5 w-5 transition-transform duration-150 ${loading ? 'opacity-50' : ''}`}
                fill={isFavorite ? 'currentColor' : 'none'}
                aria-hidden="true"
            />
        </button>
    );
}
