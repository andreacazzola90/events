import { NextRequest, NextResponse } from 'next/server';
import { validateUserCredentials } from '../../../../lib/extension-auth';
import { extensionCorsPreflight, withExtensionCors } from '../../../../lib/extension-cors';

export async function OPTIONS(request: NextRequest) {
  return extensionCorsPreflight(request);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = (body?.email || '').toString();
    const password = (body?.password || '').toString();

    const user = await validateUserCredentials(email, password);
    if (!user) {
      return withExtensionCors(
        NextResponse.json({ error: 'Credenziali non valide' }, { status: 401 }),
        request
      );
    }

    return withExtensionCors(
      NextResponse.json({
        user: {
          id: user.userId,
          email: user.email,
        },
      }),
      request
    );
  } catch (error) {
    console.error('[API /auth/extension-login] Error:', error);
    return withExtensionCors(
      NextResponse.json({ error: 'Errore durante il login estensione' }, { status: 500 }),
      request
    );
  }
}
