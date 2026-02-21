import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../../pages/api/auth/[...nextauth]';

async function getUserIdFromSession() {
	const session: any = await getServerSession(authOptions as any);
	if (!session?.user?.id) {
		return { userId: null, errorResponse: NextResponse.json({ error: 'Non autenticato' }, { status: 401 }) };
	}

	const userId = parseInt((session.user as any).id as string, 10);
	if (Number.isNaN(userId)) {
		return { userId: null, errorResponse: NextResponse.json({ error: 'ID utente non valido' }, { status: 400 }) };
	}

	return { userId, errorResponse: null };
}

export async function GET(_request: NextRequest) {
	try {
		const { userId, errorResponse } = await getUserIdFromSession();
		if (!userId && errorResponse) return errorResponse;

		const favorites = await prisma.favorite.findMany({
			where: { userId: userId! },
			include: { event: true },
			orderBy: { createdAt: 'desc' },
		});

		const events = favorites.map((fav) => fav.event);
		return NextResponse.json(events);
	} catch (error) {
		console.error('[API /favorites GET] Error fetching favorites:', error);
		return NextResponse.json({ error: 'Errore durante il recupero dei preferiti' }, { status: 500 });
	}
}

export async function POST(request: NextRequest) {
	try {
		const { userId, errorResponse } = await getUserIdFromSession();
		if (!userId && errorResponse) return errorResponse;

		const body = await request.json();
		const eventId = parseInt((body?.eventId ?? '').toString(), 10);
		if (!eventId || Number.isNaN(eventId)) {
			return NextResponse.json({ error: 'eventId non valido' }, { status: 400 });
		}

		// Crea il preferito se non esiste già
		await prisma.favorite.upsert({
			where: {
				userId_eventId: {
					userId: userId!,
					eventId,
				},
			},
			update: {},
			create: {
				userId: userId!,
				eventId,
			},
		});

		return NextResponse.json({ ok: true });
	} catch (error) {
		console.error('[API /favorites POST] Error adding favorite:', error);
		return NextResponse.json({ error: 'Errore durante l\'aggiunta ai preferiti' }, { status: 500 });
	}
}

export async function DELETE(request: NextRequest) {
	try {
		const { userId, errorResponse } = await getUserIdFromSession();
		if (!userId && errorResponse) return errorResponse;

		const body = await request.json();
		const eventId = parseInt((body?.eventId ?? '').toString(), 10);
		if (!eventId || Number.isNaN(eventId)) {
			return NextResponse.json({ error: 'eventId non valido' }, { status: 400 });
		}

		await prisma.favorite.deleteMany({
			where: {
				userId: userId!,
				eventId,
			},
		});

		return NextResponse.json({ ok: true });
	} catch (error) {
		console.error('[API /favorites DELETE] Error removing favorite:', error);
		return NextResponse.json({ error: 'Errore durante la rimozione dai preferiti' }, { status: 500 });
	}
}
