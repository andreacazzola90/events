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
  originalImageUrl?: string;
  /** Draft-only: automatic crop rectangle (0..1 of the original image), used to preselect the manual cropper. */
  originalImageCrop?: { x: number; y: number; width: number; height: number };
  /** Signed AI extraction baseline; corrections made before saving are learned for future scans. */
  scanFeedbackToken?: string;
  sourceUrl?: string;
  origin?: string;
}

/** Existing DB event that a scanned event likely duplicates. */
export interface DuplicateMatch {
  id: number;
  title: string;
  date: string;
  time: string;
  location: string;
  slug: string;
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
