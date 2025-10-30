// Categorie predefinite per gli eventi
export type EventCategory = 
  | 'Musica'
  | 'Sport'
  | 'Cultura'
  | 'Teatro'
  | 'Cinema'
  | 'Food & Drink'
  | 'Feste'
  | 'Bambini'
  | 'Workshop'
  | 'Altro';

export interface EventData {
  title: string;
  description: string;
  date: string;
  time: string;
  location: string;
  organizer: string;
  category: EventCategory | string; // Permette anche stringhe custom
  price: string;
  rawText: string;
  imageUrl?: string;
}

export interface ProcessImageResponse {
  events: EventData[];
  count: number;
}

export interface OCRResponse {
  ParsedResults: {
    ParsedText: string;
    ErrorDetails: string;
    ErrorMessage: string;
  }[];
  IsErroredOnProcessing: boolean;
  ErrorMessage: string | null;
}