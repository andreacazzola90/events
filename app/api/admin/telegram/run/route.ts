import { runServiceScan } from '../../../../../lib/service-scanning-api';
import { scanTelegramQueue } from '../../../../../lib/telegram-event-scanning';

export const runtime = 'nodejs';
export const maxDuration = 300;
export async function POST(request: Request) {
  return runServiceScan(request, 'telegram-bot', scanTelegramQueue);
}
