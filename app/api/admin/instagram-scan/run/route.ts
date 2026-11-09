import { runServiceScan } from '../../../../../lib/service-scanning-api';
import { scanInstagram } from '../../../../../lib/instagram-event-scanning';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;
export async function POST(request: Request) {
  return runServiceScan(request, 'instagram', scanInstagram);
}
