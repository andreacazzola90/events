import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as pdfText from './pdf-text.ts';

const source = readFileSync(new URL('./event-scan-pipeline.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const context = { exports: {}, AbortController, AbortSignal, clearTimeout, setTimeout, require: name => {
  if (name === './pdf-text') return pdfText;
  throw new Error(`Unexpected import ${name}`);
} };
runInNewContext(compiled, context);
const toNative = value => JSON.parse(JSON.stringify(value));
const censusPdfCandidates = (...args) => toNative(context.exports.censusPdfCandidates(...args));
const scanPdfEventPages = async (...args) => toNative(await context.exports.scanPdfEventPages(...args));

const page = (first, second = '') => [
  'GIOVEDÌ 10 OTTOBRE 2026',
  first,
  'Ore 20:30, Teatro Civico di Schio',
  ...(second ? [second, 'Ore 21:00, Palazzo Toaldi Capra'] : []),
].join('\n');

function responseFor(candidates) {
  return JSON.stringify({
    events: candidates.map(candidate => ({
      candidateId: candidate.candidateId,
      date: '2026-10-10',
      time: candidate.title === 'CONCERTO IN PIAZZA' ? '20:30' : '21:00',
      location: candidate.title === 'CONCERTO IN PIAZZA' ? 'Teatro Civico di Schio' : 'Palazzo Toaldi Capra',
      organizer: 'Comune di Schio',
      category: 'concerto',
      price: 'Gratuito',
      description: 'Concerto dal vivo nella piazza principale di Schio.',
      evidence: candidate.pageText,
    })),
  });
}

test('census keeps same-day activities distinct and associates each with its page', async () => {
  const pages = [page('CONCERTO IN PIAZZA', 'MOSTRA DI FOTOGRAFIA')];
  const candidates = censusPdfCandidates(pages);
  assert.deepEqual(candidates.map(candidate => [candidate.title, candidate.pageNumber]), [
    ['CONCERTO IN PIAZZA', 1],
    ['MOSTRA DI FOTOGRAFIA', 1],
  ]);
  const result = await scanPdfEventPages(pages, async messages => {
    const request = JSON.parse(messages[1].content);
    return responseFor(request.candidates);
  });

  assert.equal(result.status, 'completed');
  assert.equal(result.counts.completed, 2);
  assert.deepEqual(result.events.map(event => event.title), ['CONCERTO IN PIAZZA', 'MOSTRA DI FOTOGRAFIA']);
  assert.ok(result.events.every(event => event.scanEvidence.pageNumbers[0] === 1));
  assert.equal(result.events[0].time, '20:30');
  assert.equal(result.events[1].time, '21:00');
  assert.match(result.events[0].rawText, /Pagina 1/);
});

test('bounds candidate count and reports candidates left pending rather than claiming completion', async () => {
  const result = await scanPdfEventPages([page('CONCERTO IN PIAZZA', 'MOSTRA DI FOTOGRAFIA')], async messages => {
    return responseFor(JSON.parse(messages[1].content).candidates);
  }, { maxCandidates: 1 });

  assert.equal(result.status, 'partial');
  assert.deepEqual(result.counts, { candidates: 2, completed: 1, failed: 0, pending: 1 });
});

test('reports malformed or failed detail batches without discarding successful batches', async () => {
  const pages = Array.from({ length: 10 }, (_, index) => page(`EVENTO CULTURALE NUMERO ${index + 1}`));
  let calls = 0;
  let failedOnce = false;
  let active = 0;
  let maximumActive = 0;
  const result = await scanPdfEventPages(pages, async messages => {
    calls++;
    active++;
    maximumActive = Math.max(maximumActive, active);
    await new Promise(resolve => setImmediate(resolve));
    active--;
    if (!failedOnce) {
      failedOnce = true;
      throw new Error('provider unavailable');
    }
    return responseFor(JSON.parse(messages[1].content).candidates);
  });

  assert.equal(calls, 2);
  assert.ok(maximumActive <= 3);
  assert.equal(result.status, 'partial');
  assert.equal(result.counts.candidates, 10);
  assert.equal(result.counts.completed + result.counts.failed + result.counts.pending, 10);
  assert.equal(result.counts.failed, 8);
});
