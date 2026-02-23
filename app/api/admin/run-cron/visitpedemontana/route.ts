import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../../../../pages/api/auth/[...nextauth]';

export async function POST(request: NextRequest) {
  const session: any = await getServerSession(authOptions as any);
  const isAdmin =
    !!session?.user &&
    (((session.user as any).role === 'admin') || session.user.email === 'andreacazzola90@gmail.com');

  if (!isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const headers: HeadersInit = {};
    if (process.env.CRON_SECRET) {
      headers['authorization'] = `Bearer ${process.env.CRON_SECRET}`;
    }

    // Usa un URL relativo rispetto alla richiesta corrente, così funziona
    // sia in sviluppo che in produzione senza dipendere da NEXTAUTH_URL.
    const targetUrl = new URL('/api/cron/scrape-visitpedemontana', request.url);

    const res = await fetch(targetUrl, {
      method: 'GET',
      headers,
    });

    const text = await res.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    return NextResponse.json({ status: res.status, data });
  } catch (error) {
    console.error('[API /admin/run-cron/visitpedemontana] Error triggering cron:', error);
    return NextResponse.json(
      {
        error: 'Failed to trigger VisitPedemontana cron',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}
