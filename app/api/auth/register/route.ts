import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcrypt';
import { prisma } from '@/lib/prisma';
import {
	buildEmailVerificationUrl,
	createEmailVerificationToken,
	sendVerificationEmail,
} from '@/lib/email-verification';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

export async function POST(request: NextRequest) {
	try {
		const body = await request.json();
		const email = (body?.email || '').toString().trim().toLowerCase();
		const password = (body?.password || '').toString();

		if (!email || !password) {
			return NextResponse.json({ error: 'Email e password sono obbligatorie' }, { status: 400 });
		}

		if (!EMAIL_REGEX.test(email)) {
			return NextResponse.json({ error: 'Email non valida' }, { status: 400 });
		}

		if (password.length < MIN_PASSWORD_LENGTH) {
			return NextResponse.json(
				{ error: `La password deve contenere almeno ${MIN_PASSWORD_LENGTH} caratteri` },
				{ status: 400 }
			);
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

		const { token, tokenHash, expiresAt } = createEmailVerificationToken();
		await (prisma as any).emailVerificationToken.create({
			data: { email, tokenHash, expiresAt },
		});

		const origin = new URL(request.url).origin;
		const verifyUrl = buildEmailVerificationUrl(origin, token);
		let verificationPreviewUrl: string | null = null;
		try {
			const mailResult = await sendVerificationEmail({ to: email, verifyUrl });
			verificationPreviewUrl = mailResult.previewUrl;
		} catch (mailError) {
			// Do not fail registration if the mail provider is unavailable.
			console.error('[API /auth/register] Verification mail error:', mailError);
		}

		return NextResponse.json(
			{
				id: user.id,
				email: user.email,
				verificationPreviewUrl,
			},
			{ status: 201 }
		);
	} catch (error) {
		console.error('[API /auth/register] Error registering user:', error);
		return NextResponse.json({ error: 'Errore durante la registrazione' }, { status: 500 });
	}
}
