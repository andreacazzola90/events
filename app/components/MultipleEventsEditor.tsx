import React, { useState } from 'react';
import { EventData } from '../types/event';
import EventDisplay from './EventDisplay';

interface MultipleEventsEditorProps {
    events: EventData[];
    onSaveAll: (events: EventData[]) => Promise<void>;
    onCancel?: () => void;
}

const MultipleEventsEditor: React.FC<MultipleEventsEditorProps> = ({ events: initialEvents, onSaveAll, onCancel }) => {
    const [events, setEvents] = useState<EventData[]>(initialEvents);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleEventChange = (index: number, updated: EventData) => {
        setEvents(prev => prev.map((ev, i) => (i === index ? updated : ev)));
    };

    const handleSaveAll = async () => {
        setSaving(true);
        setError(null);
        try {
            await onSaveAll(events);
        } catch (err: any) {
            setError(err.message || 'Errore nel salvataggio degli eventi');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-8">
            {events.map((event, idx) => (
                <div key={idx} className="border rounded-lg p-4 bg-white shadow">
                    <EventDisplay eventData={event} onSave={updated => handleEventChange(idx, updated)} />
                </div>
            ))}
            {error && <div className="text-red-500 font-semibold">{error}</div>}
            <div className="flex gap-4 mt-6">
                <button
                    onClick={handleSaveAll}
                    disabled={saving}
                    className="px-6 py-2 rounded-full font-bold shadow-button bg-linear-to-r from-primary via-accent to-secondary text-white transition-all disabled:opacity-60"
                >
                    {saving ? 'Salvataggio...' : 'Aggiungi tutti gli eventi'}
                </button>
                {onCancel && (
                    <button
                        type="button"
                        onClick={onCancel}
                        className="px-6 py-2 rounded-full font-bold shadow-button bg-gray-200 text-gray-700 hover:bg-gray-300 transition-all"
                    >
                        Annulla
                    </button>
                )}
            </div>
        </div>
    );
};

export default MultipleEventsEditor;
