import { NextResponse } from 'next/server';

function isOriginAllowed(origin: string): boolean {
  const configuredOrigins = (process.env.EXTENSION_ALLOWED_ORIGINS || 'chrome-extension://*')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (configuredOrigins.includes('*')) {
    return true;
  }

  if (configuredOrigins.includes(origin)) {
    return true;
  }

  return origin.startsWith('chrome-extension://') && configuredOrigins.includes('chrome-extension://*');
}

export function withExtensionCors(response: NextResponse, request: Request): NextResponse {
  const origin = request.headers.get('origin');

  if (!origin || !isOriginAllowed(origin)) {
    return response;
  }

  response.headers.set('Access-Control-Allow-Origin', origin);
  response.headers.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  response.headers.set('Vary', 'Origin');

  return response;
}

export function extensionCorsPreflight(request: Request): NextResponse {
  return withExtensionCors(new NextResponse(null, { status: 204 }), request);
}
