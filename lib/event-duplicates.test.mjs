import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import * as fingerprint from './poster-fingerprint.ts';

const compiled = ts.transpileModule(readFileSync(new URL('./event-duplicates.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;

function load() {
  const context = {
    exports: {}, URL,
    require: name => {
      if (name === '../app/lib/prisma') return { prisma: {} };
      if (name === './event-display') return {
        sameEventStartTime: (a, b) => (a || '').trim().slice(0, 5) === (b || '').trim().slice(0, 5),
      };
      if (name === './slug-utils') return { generateUniqueSlug: (title, id) => `${title}-${id}` };
      if (name === './poster-fingerprint') return fingerprint;
      throw new Error(`Unexpected import: ${name}`);
    },
  };
  vm.runInNewContext(compiled, context);
  return context.exports;
}

const page = 'https://www.visitschio.it/it/eventi/promozione/hallovin-26';
const existing = [
  { id: 670, title: 'Hallovin 26 - Dj Biso', date: '2026-10-31', time: '18:00', location: 'Schio', sourceUrl: page },
  { id: 672, title: 'Hallovin 26 - Marco Festa', date: '2026-10-31', time: '21:30', location: 'Schio', sourceUrl: page },
];
const client = { event: { findMany: async ({ where }) => existing.filter(event => where.date.in.includes(event.date)) } };

test('re-importing a link matches the same session even with a reworded title', async () => {
  const { findDuplicateEvent } = load();
  const found = await findDuplicateEvent({ title: 'DJ set Marco Festa', date: '31/10/2026', time: '21:30', sourceUrl: `${page}/?utm=x` }, client);
  assert.equal(found?.id, 672);
});

test('a draft without time still duplicates a same-day event with a similar title', async () => {
  const { findDuplicateEvent } = load();
  assert.equal((await findDuplicateEvent({ title: 'Hallovin 26 - Dj Biso', date: '2026-10-31', time: '' }, client))?.id, 670);
});

test('different start time or different source and title are not duplicates', async () => {
  const { findDuplicateEvent } = load();
  assert.equal(await findDuplicateEvent({ title: 'Altro', date: '2026-10-31', time: '23:00', sourceUrl: page }, client), null);
  assert.equal(await findDuplicateEvent({ title: 'Concerto jazz', date: '2026-10-31', time: '21:30', sourceUrl: 'https://other.example/a' }, client), null);
  assert.equal(await findDuplicateEvent({ title: 'Hallovin 26 - Dj Biso', date: '2026-11-01', time: '18:00' }, client), null);
});

test('the same poster on the same day matches even with another time, title and location', async () => {
  const { findDuplicateEvent } = load();
  const rows = [{ ...existing[0], imageUrl: 'https://example.test/poster.jpg', originalImageUrl: null }];
  const db = { event: { findMany: async () => rows } };
  const found = await findDuplicateEvent({
    title: 'Incontro', date: '2026-10-31', time: '21:00', location: 'Valdagno',
    imageUrl: 'https://example.test/poster.jpg',
  }, db);
  assert.equal(found?.id, 670);
});

test('a different venue prevents a title-only match without a shared poster', async () => {
  const { findDuplicateEvent } = load();
  assert.equal(await findDuplicateEvent({
    title: 'Hallovin 26 - Dj Biso', date: '2026-10-31', time: '18:00', location: 'Valdagno',
  }, client), null);
});

test('identical poster bytes match only on the same day when fingerprint matching is enabled', async () => {
  const previous = process.env.EVENT_POSTER_FINGERPRINT_ENABLED;
  process.env.EVENT_POSTER_FINGERPRINT_ENABLED = 'true';
  try {
    const hash = fingerprint.posterFingerprint(Buffer.from('same poster'));
    const rows = [{ ...existing[0], imageUrl: 'https://old.example/poster.jpg' }];
    const db = {
      event: { findMany: async ({ where }) => rows.filter(event => where.date.in.includes(event.date)) },
      $queryRaw: async (_query, value) => value === hash ? [{ eventId: 670 }] : [],
    };
    const candidate = { title: 'Un altro titolo', date: '31/10/2026', time: '23:00', location: 'Valdagno', imageUrl: 'https://new.example/poster.jpg', posterFingerprint: hash };
    const { findDuplicateEvent } = load();
    assert.equal((await findDuplicateEvent(candidate, db))?.id, 670);
    assert.equal(await findDuplicateEvent({ ...candidate, date: '01/11/2026' }, db), null);
    assert.equal(await findDuplicateEvent({ ...candidate, posterFingerprint: fingerprint.posterFingerprint(Buffer.from('different poster')) }, db), null);
    process.env.EVENT_POSTER_FINGERPRINT_ENABLED = 'false';
    assert.equal(await findDuplicateEvent(candidate, db), null);
  } finally {
    if (previous === undefined) delete process.env.EVENT_POSTER_FINGERPRINT_ENABLED;
    else process.env.EVENT_POSTER_FINGERPRINT_ENABLED = previous;
  }
});

test('fingerprint writes are disabled before migration and database errors propagate when enabled', async () => {
  const previous = process.env.EVENT_POSTER_FINGERPRINT_ENABLED;
  try {
    const db = { $executeRaw: async () => { throw new Error('database unavailable'); } };
    process.env.EVENT_POSTER_FINGERPRINT_ENABLED = 'false';
    await fingerprint.savePosterFingerprint(db, 1, fingerprint.posterFingerprint(Buffer.from('poster')));
    process.env.EVENT_POSTER_FINGERPRINT_ENABLED = 'true';
    await assert.rejects(fingerprint.savePosterFingerprint(db, 1, fingerprint.posterFingerprint(Buffer.from('poster'))), /database unavailable/);
    await assert.rejects(fingerprint.savePosterFingerprint(db, 1, 'bad'), /Invalid poster fingerprint/);
  } finally {
    if (previous === undefined) delete process.env.EVENT_POSTER_FINGERPRINT_ENABLED;
    else process.env.EVENT_POSTER_FINGERPRINT_ENABLED = previous;
  }
});
