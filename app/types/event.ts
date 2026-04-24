/** Full event record as stored in the database (mirrors the Prisma Event model). */
export interface DbEvent {
  id: number;
  title: string;
  description: string;
  date: string;
  time: string;
  location: string;
  latitude: number | null;
  longitude: number | null;
  organizer: string;
  category: string;
  price: string;
  rawText: string;
  imageUrl: string | null;
  sourceUrl: string | null;
  externalId: string | null;
  origin: string;
  createdAt: Date;
  updatedAt: Date;
  createdById: number | null;
}

export interface EventData {
  title: string;
  description: string;
  date: string;
  time: string;
  location: string;
  organizer: string;
  category: string;
  price: string;
  rawText: string;
  imageUrl?: string;
  sourceUrl?: string;
  origin?: string;
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
