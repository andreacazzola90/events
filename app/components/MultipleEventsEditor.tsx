import React, { useEffect, useState } from 'react';
import { DuplicateMatch, EventData } from '../types/event';
import EventDisplay from './EventDisplay';
import type { DraftImageCropFailure, DraftImageCropStatus } from '../../lib/draft-image-crop';

interface MultipleEventsEditorProps {
    events: EventData[];
    duplicates?: (DuplicateMatch | null)[];
    onEventsChange?: (events: EventData[]) => void;
    onSaveAll: (events: EventData[]) => Promise<void>;
    onCancel?: () => void;
    publishing?: boolean;
    imageProcessing?: boolean;
    imageCropStatus?: DraftImageCropStatus;
    imageCropFailure?: DraftImageCropFailure;
    onImageChange?: (index: number, imageUrl: string, originalImageUrl?: string) => void;
}

const MultipleEventsEditor: React.FC<MultipleEventsEditorProps> = ({ events: initialEvents, duplicates = [], onEventsChange, onSaveAll, onCancel, publishing = false, imageProcessing = false, imageCropStatus, imageCropFailure, onImageChange }) => {
    const [events, setEvents] = useState<EventData[]>(initialEvents);
    useEffect(() => setEvents(initialEvents), [initialEvents]);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const newEvents = events.filter((_, i) => !duplicates[i]);
    const isSaving = saving || publishing;
    const saveLabel = isSaving
        ? 'Pubblicazione...'
        : events.length === 1
            ? 'Pubblica'
            : newEvents.length === events.length || newEvents.length === 0
            ? 'Pubblica tutti gli eventi'
            : `Pubblica ${newEvents.length} eventi nuovi`;

    const handleEventChange = (index: number, updated: EventData) => {
        const next = events.map((ev, i) => (i === index ? updated : ev));
        setEvents(next);
        onEventsChange?.(next);
    };

    const handleSaveAll = async () => {
        if (isSaving) return;
        setSaving(true);
        setError(null);
        try {
            await onSaveAll(newEvents);
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
                    <EventDisplay eventData={event} imageProcessing={imageProcessing} imageCropStatus={imageCropStatus} imageCropFailure={imageCropFailure} onImageChange={(image, original) => onImageChange?.(idx, image, original)} duplicate={duplicates[idx]} onSave={updated => handleEventChange(idx, updated)} showPublishButton={!isSaving && !imageProcessing} />
                </div>
            ))}
            {error && <div role="alert" className="text-red-500 font-semibold">{error}</div>}

            {/* Pulsanti in basso */}
            <div className="mt-6 flex items-center gap-2">
                <button
                    type="button"
                    data-testid="publish-all-events-bottom"
                    onClick={handleSaveAll}
                    disabled={isSaving}
                    aria-busy={isSaving}
                    className="inline-flex min-h-11 min-w-0 flex-1 items-center justify-center rounded-md bg-[#1d1d1b] px-3 py-2 text-center text-sm font-bold text-white shadow-sm transition-colors hover:bg-[#d65a38] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1d1d1b] disabled:cursor-wait disabled:opacity-70 sm:flex-none sm:px-6"
                >
                    {saveLabel}
                </button>
                {onCancel && (
                    <button
                        type="button"
                        onClick={onCancel}
                        disabled={isSaving}
                        className="shrink-0 rounded-full px-2 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-50 sm:px-3 sm:text-sm"
                    >
                        Torna indietro
                    </button>
                )}
            </div>
        </div>
    );
};

export default MultipleEventsEditor;
