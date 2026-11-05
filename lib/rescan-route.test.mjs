import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import ts from 'typescript';
import * as eventRescan from './event-rescan.ts';

const source = readFileSync(new URL('../app/api/ai/rescan-event/route.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

test('rescan rejects partial PDF results without returning an applicable proposal', async () => {
  const current = {
    title: 'Concerto in piazza',
    description: 'Descrizione originale',
    date: '2026-10-10',
    time: '20:00',
    location: 'Teatro Civico di Schio',
    organizer: 'Comune',
    category: 'musica',
    price: 'Gratuito',
    rawText: '',
    sourceUrl: 'https://events.example/program.pdf',
  };
  const context = {
    exports: {},
    TextDecoder,
    URL,
    Number,
    Headers,
    require: name => {
      if (name === 'next/server') return { NextResponse: {
        json: (body, options = {}) => ({ body, status: options.status ?? 200 }),
      } };
      if (name === '../../../../lib/event-processor') return { processEventLink: async () => ({ events: [] }) };
      if (name === '../../../../lib/pdf-event-processing') return { processPdfEventDocument: async () => ({
        events: [{ ...current, time: '21:00' }],
        debug: {
          scanStatus: 'partial',
          scanCounts: { candidates: 2, completed: 1, failed: 0, pending: 1 },
          unscannedPages: 0,
        },
      }) };
      if (name === '../../../../lib/pdf-download') return { downloadPublicPdf: async () => new Uint8Array([1]) };
      if (name === '../../../../lib/pdf-url') return {
        validatePublicScanUrl: async value => new URL(value),
        validatePublicPdfUrl: async value => new URL(value),
      };
      if (name === '../../../../lib/event-rescan') return eventRescan;
      if (name === '../../../../lib/request-body-limit') return {
        readBoundedRequestBody: async () => new TextEncoder().encode(JSON.stringify({ event: current })),
        RequestBodyTooLargeError: class extends Error {},
      };
      throw new Error(`Unexpected import ${name}`);
    },
  };
  runInNewContext(compiled, context);

  const response = await context.exports.POST({
    headers: new Headers(),
    signal: new AbortController().signal,
  });
  assert.equal(response.status, 422);
  assert.equal(response.body.status, 'partial');
  assert.equal('proposal' in response.body, false);
});
