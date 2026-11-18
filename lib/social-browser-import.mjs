const MAX_TEXT_LENGTH = 10_000;
const MAX_IMAGE_BYTES = 1_500_000;
const MAX_BODY_BYTES = 2_100_000;
const MAX_IMAGE_DIMENSION = 4096;
const MAX_IMAGE_PIXELS = 12_000_000;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

class InvalidSocialImportInput extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function readRequestBody(request) {
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    throw new InvalidSocialImportInput(413, 'preview_too_large');
  }
  if (!request.body) throw new InvalidSocialImportInput(400, 'invalid_preview');

  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new InvalidSocialImportInput(413, 'preview_too_large');
    }
    chunks.push(value);
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(body);
  } catch {
    throw new InvalidSocialImportInput(400, 'invalid_preview');
  }
}

function parseSocialImportInput(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new InvalidSocialImportInput(400, 'invalid_preview');
  }

  const keys = Object.keys(value);
  const sources = keys.filter((key) => key === 'text' || key === 'image');
  if (value.consent !== true || keys.length !== 2 || sources.length !== 1 ||
    keys.some((key) => key !== 'consent' && key !== 'text' && key !== 'image')) {
    throw new InvalidSocialImportInput(400, 'invalid_preview');
  }

  if (sources[0] === 'text') {
    if (typeof value.text !== 'string' || value.text.trim().length < 2 ||
      value.text.length > MAX_TEXT_LENGTH) {
      throw new InvalidSocialImportInput(400, 'invalid_preview');
    }
    return { text: value.text.trim() };
  }

  if (typeof value.image !== 'string') {
    throw new InvalidSocialImportInput(400, 'invalid_preview');
  }
  const match = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/.exec(value.image);
  if (!match) throw new InvalidSocialImportInput(400, 'invalid_preview');

  const image = Buffer.from(match[1], 'base64');
  if (image.length < 24 || image.length > MAX_IMAGE_BYTES ||
    !PNG_SIGNATURE.every((byte, index) => image[index] === byte) ||
    image.toString('ascii', 12, 16) !== 'IHDR') {
    throw new InvalidSocialImportInput(400, 'invalid_preview');
  }
  const width = image.readUInt32BE(16);
  const height = image.readUInt32BE(20);
  if (!width || !height || width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION ||
    width * height > MAX_IMAGE_PIXELS) {
    throw new InvalidSocialImportInput(400, 'invalid_preview');
  }
  return { image: new Uint8Array(image) };
}

function safeCandidate(candidate) {
  return {
    title: candidate.title,
    description: candidate.description,
    date: candidate.date,
    time: candidate.time,
    location: candidate.location,
    organizer: candidate.organizer,
    category: candidate.category,
    price: candidate.price,
  };
}

function jsonResponse(body, status = 200) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export function createSocialBrowserImportHandler(dependencies) {
  return async function handleSocialBrowserImport(request) {
    try {
      const user = await dependencies.authenticate(request);
      if (!user) return jsonResponse({ error: 'unauthorized' }, 401);
      if (!user.isAdmin) return jsonResponse({ error: 'admin_required' }, 403);
      if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || '')) {
        return jsonResponse({ error: 'invalid_preview' }, 400);
      }

      let payload;
      try {
        payload = JSON.parse(await readRequestBody(request));
      } catch (error) {
        if (error instanceof InvalidSocialImportInput) throw error;
        throw new InvalidSocialImportInput(400, 'invalid_preview');
      }

      const input = parseSocialImportInput(payload);
      const extraction = await dependencies.extract({
        ...input,
        signal: AbortSignal.timeout(35_000),
        fail: () => new Error('social_import_failed'),
      });

      const events = Array.isArray(extraction?.events)
        ? extraction.events.slice(0, 10).map(safeCandidate)
        : [];
      return jsonResponse({ events });
    } catch (error) {
      if (error instanceof InvalidSocialImportInput) {
        return jsonResponse({ error: error.message }, error.status);
      }
      return jsonResponse({ error: 'social_import_unavailable' }, 503);
    }
  };
}
