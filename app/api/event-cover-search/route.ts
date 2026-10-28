import { handleCoverSearch } from '../../../lib/event-cover';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 25;

export async function POST(request: Request) {
  return handleCoverSearch(request);
}