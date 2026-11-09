import { runServiceScan } from '../../../../../lib/service-scanning-api';
import { scanPersonalTelegramSources } from '../../../../../lib/personal-telegram-scanning';

export const runtime = 'nodejs';
export const maxDuration = 300;
export async function POST(request: Request) {
  return runServiceScan(request, 'personal', scanPersonalTelegramSources, true);
}
