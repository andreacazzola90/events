export const STANDARD_CATEGORIES = [
    'musica',
    'nightlife',
    'cultura',
    'cibo',
    'sport',
    'famiglia',
    'teatro',
    'festa',
    'passeggiata',
    'altro'
];

export const CATEGORY_MAPPING: Record<string, string> = {
    'music': 'musica',
    'culture': 'cultura',
    'food': 'cibo',
    'family': 'famiglia',
    'theater': 'teatro',
    'party': 'festa',
    'walk': 'passeggiata',
    'other': 'altro'
};

export const GOOGLE_CALENDAR_EVENT_TYPES = [
    { value: 'default', label: 'Evento' },
    { value: 'birthday', label: 'Compleanno' },
    { value: 'focusTime', label: 'Momento di concentrazione' },
    { value: 'outOfOffice', label: 'Fuori sede' },
    { value: 'workingLocation', label: 'Luogo di lavoro' },
] as const;

export type GoogleCalendarEventType = typeof GOOGLE_CALENDAR_EVENT_TYPES[number]['value'];

export function normalizeGoogleCalendarEventType(input: unknown): GoogleCalendarEventType | null {
    return GOOGLE_CALENDAR_EVENT_TYPES.find(type => type.value === input)?.value ?? null;
}

export const PRICE_NORMALIZATION_MAP: Record<string, string> = {
    'gratis': 'Gratuito',
    'ingresso libero': 'Gratuito',
    'free': 'Gratuito',
    'entrata libera': 'Gratuito',
    'offerta libera': 'Offerta Libera',
    'contributo libero': 'Offerta Libera'
};
