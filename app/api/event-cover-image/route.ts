import { handleCoverImage } from '../../../lib/event-cover';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 15;

export async function GET(request: Request) {
  return handleCoverImage(request);
}