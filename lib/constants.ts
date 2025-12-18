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

export const PRICE_NORMALIZATION_MAP: Record<string, string> = {
    'gratis': 'Gratuito',
    'ingresso libero': 'Gratuito',
    'free': 'Gratuito',
    'entrata libera': 'Gratuito',
    'offerta libera': 'Offerta Libera',
    'contributo libero': 'Offerta Libera'
};
