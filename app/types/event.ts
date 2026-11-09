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
  originalImageUrl: string | null;
  originalImageCropX: number | null;
  originalImageCropY: number | null;
  originalImageCropWidth: number | null;
  originalImageCropHeight: number | null;
  sourceUrl: string | null;
  externalId: string | null;
  origin: string;
  createdAt: Date;
  updatedAt: Date;
  createdById: number | null;
}

export interface EventData {
  title: string;
  seriesTitle?: string;
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
  /** Crop rectangle normalized to the original image; also persisted with the event. */
  originalImageCrop?: { x: number; y: number; width: number; height: number };
  /** Draft-only: full poster saved as an extra image when the cover is just this event's section. */
  posterImageUrl?: string;
  /** Signed AI extraction baseline; corrections made before saving are learned for future scans. */
  scanFeedbackToken?: string;
  /** Source evidence retained with a PDF scan result until the draft is saved. */
  scanEvidence?: { candidateId: string; pageNumbers: number[]; quote: string };
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
