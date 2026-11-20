/** Full event record as stored in the database (mirrors the Prisma Event model). */
export const EVENT_STATUSES = ['Scheduled', 'Cancelled', 'Postponed', 'Rescheduled'] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export const PERFORMER_TYPES = ['Person', 'PerformingGroup'] as const;
export type PerformerType = (typeof PERFORMER_TYPES)[number];

export const OFFER_AVAILABILITIES = [
  'InStock',
  'SoldOut',
  'PreOrder',
  'PreSale',
  'LimitedAvailability',
  'OutOfStock',
  'Discontinued',
  'BackOrder',
  'MadeToOrder',
  'OnlineOnly',
  'InStoreOnly',
] as const;
export type OfferAvailability = (typeof OFFER_AVAILABILITIES)[number];

export interface DbEvent {
  id: number;
  title: string;
  description: string;
  date: string;
  time: string;
  location: string;
  endDate: string | null;
  endTime: string | null;
  address: string | null;
  performerName: string | null;
  performerType: PerformerType | null;
  latitude: number | null;
  longitude: number | null;
  organizer: string;
  organizerUrl: string | null;
  category: string;
  price: string;
  offerUrl: string | null;
  offerAvailability: OfferAvailability | null;
  offerValidFrom: string | null;
  eventStatus: EventStatus;
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
  isPublished: boolean;
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
  endDate?: string | null;
  endTime?: string | null;
  address?: string | null;
  performerName?: string | null;
  performerType?: PerformerType | null;
  organizer: string;
  organizerUrl?: string | null;
  category: string;
  price: string;
  offerUrl?: string | null;
  offerAvailability?: OfferAvailability | null;
  offerValidFrom?: string | null;
  eventStatus?: EventStatus | null;
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
