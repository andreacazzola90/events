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