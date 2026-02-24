import bcrypt from 'bcrypt';
import { prisma } from '@/lib/prisma';

export type ExtensionAuthenticatedUser = {
  userId: number;
  email: string;
};

export async function validateUserCredentials(email: string, password: string): Promise<ExtensionAuthenticatedUser | null> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || !password) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: {
      email: normalizedEmail,
    },
  });

  if (!user || !user.password) {
    return null;
  }

  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) {
    return null;
  }

  return {
    userId: user.id,
    email: user.email,
  };
}

function parseBasicAuthorization(authorization: string | null): { email: string; password: string } | null {
  if (!authorization || !authorization.startsWith('Basic ')) {
    return null;
  }

  try {
    const encodedCredentials = authorization.slice('Basic '.length).trim();
    const decodedCredentials = Buffer.from(encodedCredentials, 'base64').toString('utf-8');
    const separatorIndex = decodedCredentials.indexOf(':');

    if (separatorIndex <= 0) {
      return null;
    }

    const email = decodedCredentials.slice(0, separatorIndex);
    const password = decodedCredentials.slice(separatorIndex + 1);
    return { email, password };
  } catch {
    return null;
  }
}

export async function authenticateExtensionRequest(request: Request): Promise<ExtensionAuthenticatedUser | null> {
  const authorization = request.headers.get('authorization');
  const basicCredentials = parseBasicAuthorization(authorization);

  if (!basicCredentials) {
    return null;
  }

  return validateUserCredentials(basicCredentials.email, basicCredentials.password);
}
