import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

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
