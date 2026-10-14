import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import * as instructions from './ai-instructions.ts';

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
    },
  }));

  assert.equal(response.status, 200);
  assert.equal(response.body.event.title, 'Mostra di teatro');
  assert.equal(response.body.event.imageUrl, 'https://images.example/cover.jpg');
  assert.equal(response.body.event.sourceUrl, 'https://events.example/amleto');
  assert.equal(response.body.event.rawText, 'Amleto al Teatro Civico di Schio');
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
});