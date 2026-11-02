// Gives events that share one multi-event poster their own section as cover and keeps the full poster as gallery image.
// Dry run by default; pass --apply to write. Optional: --series=<slug> to limit to one series.
import { createHash, randomUUID } from 'node:crypto';
import nextEnv from '@next/env';
import { PrismaClient } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';
import { MAX_EVENT_ATTACHMENTS, validateEventMediaFile } from '../lib/event-media.ts';
import { extractEventSections } from '../lib/poster-sections.ts';

nextEnv.loadEnvConfig(process.cwd());
const apply = process.argv.includes('--apply');
const seriesSlug = process.argv.find(value => value.startsWith('--series='))?.slice('--series='.length);
const POSTER_NAME = 'Locandina completa';
const prisma = new PrismaClient();
const storage = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
}).storage.from('events');

const POSTER_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

async function upload(eventId, name, bytes, contentType) {
  const storagePath = `${eventId}/${randomUUID()}-${name}`;
  const { error } = await storage.upload(storagePath, bytes, { contentType, upsert: false });
  if (error) throw error;
  return { storagePath, url: storage.getPublicUrl(storagePath).data.publicUrl };
}

async function applySection(event, section, poster) {
  if (event.media.length >= MAX_EVENT_ATTACHMENTS) throw new Error('attachment limit reached');
  const extension = POSTER_TYPES[poster.type];
  const name = `Locandina-completa.${extension}`;
  const validation = extension ? validateEventMediaFile(name, poster.type, poster.bytes) : { ok: false, error: 'unsupported type' };
  if (!validation.ok) throw new Error(`poster rejected: ${validation.error}`);
  const uploaded = [];
  try {
    const cover = await upload(event.id, 'sezione.jpg', section.image, 'image/jpeg');
    uploaded.push(cover.storagePath);
    const full = await upload(event.id, name, poster.bytes, poster.type);
    uploaded.push(full.storagePath);
    const position = Math.min(0, ...event.media.map(media => media.position - 1));
    await prisma.$transaction([
      prisma.eventMedia.create({
        data: { eventId: event.id, kind: 'image', fileName: POSTER_NAME, mimeType: poster.type, sizeBytes: poster.bytes.length,
          storagePath: full.storagePath, url: full.url, position },
      }),
      prisma.event.update({ where: { id: event.id }, data: { imageUrl: cover.url } }),
    ]);
  } catch (error) {
    if (uploaded.length) await storage.remove(uploaded).catch(() => undefined);
    throw error;
  }
}

const events = await prisma.event.findMany({
  where: {
    imageUrl: { not: null },
    eventSeriesId: { not: null },
    ...(seriesSlug ? { eventSeries: { slug: seriesSlug } } : {}),
    media: { none: { fileName: POSTER_NAME } },
  },
  select: { id: true, title: true, date: true, imageUrl: true, eventSeriesId: true, media: { select: { position: true } } },
  orderBy: [{ date: 'asc' }, { id: 'asc' }],
});
// Each event of a batch upload got its own copy of the poster: group identical files within a series.
const groups = new Map();
for (const event of events) {
  let bytes;
  let type;
  try {
    const response = await fetch(event.imageUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    type = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() ?? '';
    bytes = Buffer.from(await response.arrayBuffer());
  } catch (error) {
    console.warn(`skip #${event.id}: ${error instanceof Error ? error.message : error}`);
    continue;
  }
  const key = `${event.eventSeriesId}:${createHash('sha256').update(bytes).digest('hex')}`;
  const group = groups.get(key) ?? { poster: { bytes, type }, events: [] };
  group.events.push(event);
  groups.set(key, group);
}
let updated = 0;
let failed = 0;

try {
  for (const { poster, events: group } of groups.values()) {
    if (group.length < 2) continue;
    let sections;
    try {
      sections = await extractEventSections(poster.bytes, group.map(({ title, date }) => ({ title, date })), AbortSignal.timeout(60_000));
    } catch (error) {
      console.warn(`\n${group[0].imageUrl}\n  skipped: ${error instanceof Error ? error.message : error}`);
      continue;
    }
    console.log(`\n${group[0].imageUrl}\n  located ${sections.length}/${group.length}`);
    for (const section of sections) {
      const event = group[section.index];
      console.log(`  #${event.id} ${event.title.slice(0, 50)} -> box ${section.left},${section.top} ${section.width}x${section.height}`);
      if (!apply) { updated++; continue; }
      try {
        await applySection(event, section, poster);
        updated++;
      } catch (error) {
        failed++;
        console.warn(`  #${event.id} not updated: ${error instanceof Error ? error.message : error}`);
      }
    }
  }
  console.log(`\n${apply ? 'Updated' : 'Would update'} ${updated} event(s)${failed ? `, ${failed} failed` : ''}.`);
} finally {
  await prisma.$disconnect();
}
