import type { SocialCandidate } from './social-event-extraction';

export type SocialImportInput =
  | { text: string; image?: never }
  | { text?: never; image: Uint8Array };

type AuthenticatedExtensionUser = { userId: number; isAdmin: boolean };
type SocialImportExtractionInput = SocialImportInput & {
  signal: AbortSignal;
  fail: () => Error;
};

export function createSocialBrowserImportHandler(dependencies: {
  authenticate: (request: Request) => Promise<AuthenticatedExtensionUser | null>;
  extract: (input: SocialImportExtractionInput) => Promise<{ events: SocialCandidate[] }>;
}): (request: Request) => Promise<Response>;
