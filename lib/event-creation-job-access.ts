import 'server-only';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../pages/api/auth/[...nextauth]';
import { NextResponse } from 'next/server';

export const privateJobHeaders = { 'Cache-Control': 'private, no-store' };

export function jobResponse(data: unknown, status = 200, headers?: Record<string, string>) {
  return NextResponse.json(data, { status, headers: { ...privateJobHeaders, ...headers } });
}

export async function jobOwnerId() {
  const session = await getServerSession(authOptions) as { user?: { id?: string | number } } | null;
  const id = Number(session?.user?.id);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
