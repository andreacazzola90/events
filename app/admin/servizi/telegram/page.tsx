import { PlatformAccount } from '../../MessagingAccountsTab';
import TelegramAdmin from '../../../cron/TelegramAdmin';

export default function TelegramServicePage() {
  return <div className="space-y-6"><h2 className="text-2xl">Telegram</h2><PlatformAccount platform="telegram" /><TelegramAdmin /></div>;
}
