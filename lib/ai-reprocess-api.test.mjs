import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import * as instructions from './ai-instructions.ts';
import * as groqRateLimit from './groq-rate-limit.ts';

const compiled = ts.transpileModule(
  readFileSync(new URL('../app/api/ai/reprocess-event/route.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } },
).outputText;

function createRoute(modelEvent = {}) {
  const calls = [];
  class GroqMock {
    constructor() {
      this.chat = {
        completions: {
          create: async options => {
            calls.push(options);
            return { choices: [{ message: { content: JSON.stringify(modelEvent) } }] };
          },
        },
      };
    }
  }

  const context = {
    exports: {},
    process: { env: { GROQ_API_SECRET_KEY: 'test-key' } },
    console: { error: () => {} },
    require: name => {
      if (name === 'next/server') {
        return { NextResponse: { json: (body, options = {}) => ({ body, status: options.status || 200 }) } };
      }
      if (name === 'groq-sdk') return GroqMock;
      if (name === '../../../../lib/ai-instructions') return instructions;
      if (name.endsWith('/groq-rate-limit')) return groqRateLimit;
      throw new Error(`Unexpected import ${name}`);
    },
  };
  vm.runInNewContext(compiled, context);
  return { POST: context.exports.POST, calls };
}

const request = body => ({ json: async () => body });

test('reprocess endpoint passes instructions and preserves source fields', async () => {
  const route = createRoute({ title: 'Mostra di teatro', category: 'teatro' });
  const response = await route.POST(request({
    aiInstructions: 'Valorizza il nome dello spettacolo.',
    event: {
      title: 'Evento iniziale', description: 'Descrizione iniziale', date: '20/10/2026', time: '20:00',
      location: 'Schio', organizer: 'Comune', category: 'altro', price: 'Gratuito',
      rawText: 'Amleto al Teatro Civico di Schio', imageUrl: 'https://images.example/cover.jpg',
      sourceUrl: 'https://events.example/amleto',
      seriesTitle: 'Teatro a Schio', scanFeedbackToken: 'signed-baseline',
    },
  }));

  assert.equal(response.status, 200);
  assert.equal(response.body.event.title, 'Mostra di teatro');
  assert.equal(response.body.event.imageUrl, 'https://images.example/cover.jpg');
  assert.equal(response.body.event.sourceUrl, 'https://events.example/amleto');
  assert.equal(response.body.event.rawText, 'Amleto al Teatro Civico di Schio');
  assert.equal(response.body.event.seriesTitle, 'Teatro a Schio');
  assert.equal(response.body.event.scanFeedbackToken, 'signed-baseline');
  assert.match(route.calls[0].messages[1].content, /Valorizza il nome dello spettacolo/);
});

test('reprocess endpoint requires instructions before invoking Groq', async () => {
  const route = createRoute({});
  const response = await route.POST(request({ aiInstructions: ' ', event: { title: 'Evento' } }));

  assert.equal(response.status, 400);
  assert.equal(route.calls.length, 0);
});

test('reprocess endpoint keeps current values when the model returns empty or invalid fields', async () => {
  const route = createRoute({ title: '', description: '', date: '2026-02-31', time: '25:99' });
  const response = await route.POST(request({
    aiInstructions: 'Rivedi la classificazione.',
    event: {
      title: 'Titolo originale', description: 'Descrizione originale', date: '28/02/2026', time: '20:00',
      location: 'Schio', organizer: 'Comune', category: 'teatro', price: 'Gratuito', rawText: 'Spettacolo a Schio',
    },
  }));

  assert.equal(response.body.event.title, 'Titolo originale');
  assert.equal(response.body.event.description, 'Descrizione originale');
  assert.equal(response.body.event.date, '28/02/2026');
  assert.equal(response.body.event.time, '20:00');
  assert.equal(response.body.event.seriesTitle, undefined);
});

const rescanCompiled = ts.transpileModule(
  readFileSync(new URL('../app/api/ai/rescan-event/route.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } },
).outputText;

function createRescanRoute(candidates, { validationError } = {}) {
  const calls = [];
  const pdfCalls = [];
  const context = {
    exports: {},
    Error,
    TextDecoder,
    console: { error() {} },
    require: name => {
      if (name === 'next/server') return { NextResponse: { json: (body, options = {}) => ({ body, status: options.status ?? 200 }) } };
      if (name.includes('/event-processor')) return { processEventLink: async url => {
        calls.push(url);
        return { events: candidates };
      } };
      if (name.includes('/pdf-event-processing')) return { processPdfEventDocument: async () => {
        pdfCalls.push('process');
        return { events: candidates, debug: { scanStatus: 'partial', scanCounts: { pending: 1 } } };
      } };
      if (name.includes('/pdf-download')) return { downloadPublicPdf: async () => {
        pdfCalls.push('download');
        return new Uint8Array([37, 80, 68, 70, 45]);
      } };
      if (name.includes('/pdf-url')) return {
        validatePublicScanUrl: async value => {
          if (validationError) throw new Error(validationError);
          return new URL(value);
        },
        validatePublicPdfUrl: async value => new URL(value),
      };
      if (name.includes('/request-body-limit')) return {
        readBoundedRequestBody: async request => new TextEncoder().encode(JSON.stringify(await request.json())),
        RequestBodyTooLargeError: class extends Error {},
      };
      if (name.includes('/event-rescan')) return {
        buildRescanProposal: (current, event) => Object.fromEntries(
          ['title', 'description', 'date', 'time', 'location', 'organizer', 'category', 'price']
            .filter(field => event[field] && event[field] !== current[field])
            .map(field => [field, event[field]]),
        ),
        matchRescannedEvent: (current, events) => {
          const matches = events.filter(event => event.title === current.title);
          return matches.length === 1 ? { status: 'matched', event: matches[0] } : { status: matches.length ? 'ambiguous' : 'missing' };
        },
      };
      throw new Error(`Unexpected import ${name}`);
    },
  };
  vm.runInNewContext(rescanCompiled, context);
  return {
    POST: request => context.exports.POST({ headers: new Headers(), ...request }),
    calls,
    pdfCalls,
  };
}

test('rescan endpoint returns a proposal for the matched draft only and retains partial scan status', async () => {
  const route = createRescanRoute([
    { title: 'Mostra', date: '2026-10-10', time: '18:00' },
    { title: 'Concerto in piazza', date: '2026-10-10', time: '21:00', location: 'Teatro Civico' },
  ]);
  const response = await route.POST({
    json: async () => ({ event: {
      title: 'Concerto in piazza', date: '2026-10-10', time: '20:00', location: 'Teatro Civico',
      description: 'Descrizione', organizer: 'Comune', category: 'musica', price: 'Gratuito',
      rawText: 'Fonte precedente', sourceUrl: 'https://events.example/concerto',
    } }),
    signal: new AbortController().signal,
  });
  assert.equal(response.status, 200);
  assert.equal(response.body.status, 'matched');
  assert.deepEqual(response.body.proposal, { time: '21:00' });
  assert.deepEqual(response.body.scan, undefined);
  assert.equal(route.calls.length, 1);
});

test('rescan endpoint refuses ambiguous matches and unsafe sources without calling scanners', async () => {
  const event = {
    title: 'Concerto in piazza', date: '2026-10-10', time: '20:00', location: 'Schio',
    description: 'Descrizione', organizer: 'Comune', category: 'musica', price: 'Gratuito',
    sourceUrl: 'https://events.example/concerto',
  };
  const ambiguous = createRescanRoute([{ title: event.title }, { title: event.title }]);
  const conflict = await ambiguous.POST({ json: async () => ({ event }), signal: new AbortController().signal });
  assert.equal(conflict.status, 409);
  assert.equal(conflict.body.proposal, undefined);
  assert.equal(ambiguous.calls.length, 1);

  const unsafe = createRescanRoute([], { validationError: 'La fonte deve essere ospitata su un server pubblico.' });
  const rejected = await unsafe.POST({ json: async () => ({ event }), signal: new AbortController().signal });
  assert.equal(rejected.status, 400);
  assert.equal(unsafe.calls.length, 0);
});

test('rescan endpoint refuses incomplete PDF scans without proposing an update', async () => {
  const route = createRescanRoute([{ title: 'Concerto in piazza', date: '2026-10-10', time: '21:00' }]);
  const response = await route.POST({
    json: async () => ({ event: {
      title: 'Concerto in piazza', date: '2026-10-10', time: '20:00', location: 'Schio',
      sourceUrl: 'https://events.example/program.pdf',
    } }),
    signal: new AbortController().signal,
  });
  assert.equal(response.status, 422);
  assert.equal(response.body.status, 'partial');
  assert.equal('proposal' in response.body, false);
  assert.deepEqual(route.pdfCalls, ['download', 'process']);
  assert.equal(route.calls.length, 0);
});