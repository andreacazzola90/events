import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcrypt';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
	try {
		const body = await request.json();
		const email = (body?.email || '').toString().trim().toLowerCase();
		const password = (body?.password || '').toString();

		if (!email || !password) {
			return NextResponse.json({ error: 'Email e password sono obbligatorie' }, { status: 400 });
		}

		// Controlla se l'utente esiste già
		const existingUser = await prisma.user.findUnique({ where: { email } });
		if (existingUser) {
			return NextResponse.json({ error: 'Utente già registrato con questa email' }, { status: 409 });
		}

		const hashedPassword = await bcrypt.hash(password, 10);

		const user = await prisma.user.create({
			data: {
				email,
				password: hashedPassword,
				role: 'user',
				type: 'user',
			},
		});

		return NextResponse.json(
			{
				id: user.id,
				email: user.email,
			},
			{ status: 201 }
		);
	} catch (error) {
		console.error('[API /auth/register] Error registering user:', error);
		return NextResponse.json({ error: 'Errore durante la registrazione' }, { status: 500 });
	}
}
