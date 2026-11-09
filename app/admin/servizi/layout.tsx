import { getServerSession } from 'next-auth/next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { authOptions } from '../../../pages/api/auth/[...nextauth]';
import { prisma } from '../../lib/prisma';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Servizi di scraping', robots: { index: false, follow: false } };

export default async function ServicesLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions) as { user?: { id?: string } } | null;
  const ownerId = Number((session?.user as { id?: string } | undefined)?.id);
  if (!Number.isSafeInteger(ownerId) || ownerId < 1) redirect('/auth');
  const owner = await prisma.user.findUnique({ where: { id: ownerId }, select: { role: true, type: true } });
  if (owner?.role !== 'admin' && owner?.type !== 'admin') redirect('/account');
  return <main className="min-h-screen p-4 pt-24 sm:p-8 sm:pt-28 cron-page">
    <div className="max-w-5xl mx-auto space-y-6">
      <h1 className="text-3xl font-semibold">Servizi di scraping</h1>
      <nav aria-label="Servizi di scraping" className="flex flex-wrap gap-4">
        <Link href="/admin/servizi/telegram">Telegram</Link>
        <Link href="/admin/servizi/whatsapp">WhatsApp</Link>
        <Link href="/admin/servizi/instagram">Instagram</Link>
        <Link href="/admin">Amministrazione</Link><Link href="/cron">Cron</Link>
      </nav>
      {children}
    </div>
  </main>;
}
