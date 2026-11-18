import { NextRequest, NextResponse } from 'next/server';
import { authenticateExtensionRequest } from '../../../../lib/extension-auth';
import { extractSocialEvents } from '../../../../lib/social-event-extraction';
import { createSocialBrowserImportHandler } from '../../../../lib/social-browser-import.mjs';
import { extensionCorsPreflight, withExtensionCors } from '../../../../lib/extension-cors';

export const runtime = 'nodejs';

const handleImport = createSocialBrowserImportHandler({
  authenticate: authenticateExtensionRequest,
  extract: input => extractSocialEvents({
    text: input.text ?? '',
    ...(input.image ? { image: Buffer.from(input.image) } : {}),
    signal: input.signal,
    fail: input.fail,
    ...(input.image ? { imageMimeType: 'image/png' as const } : {}),
    includeVerifiedImage: false,
    logProviderFailures: false,
  }),
});

export async function OPTIONS(request: NextRequest) {
  return extensionCorsPreflight(request);
}

export async function POST(request: NextRequest) {
  const response = await handleImport(request);
  return withExtensionCors(new NextResponse(response.body, {
    status: response.status,
    headers: response.headers,
  }), request);
}
