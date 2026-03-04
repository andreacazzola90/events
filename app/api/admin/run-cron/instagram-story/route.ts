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
    let target: 'instagram-story' | 'visitpedemontana' = 'instagram-story';
    try {
      const body = await request.json();
      if (body?.target === 'visitpedemontana') {
        target = 'visitpedemontana';
      }
    } catch {
      // Body opzionale: default instagram-story
    }

    const headers: HeadersInit = {};
    if (process.env.CRON_SECRET) {
      headers['authorization'] = `Bearer ${process.env.CRON_SECRET}`;
    }

    const targetPath = target === 'visitpedemontana'
      ? '/api/cron/scrape-visitpedemontana'
      : '/api/cron/generate-instagram-story';
    const targetUrl = new URL(targetPath, request.url);

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

    return NextResponse.json({ status: res.status, target, data });
  } catch (error) {
    console.error('[API /admin/run-cron/instagram-story] Error triggering cron:', error);
    return NextResponse.json(
      {
        error: 'Failed to trigger Instagram Story cron',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}
