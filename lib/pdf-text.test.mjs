import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractPdfTitleCandidates, isNonEventPdfTitle, summarizePdfPages, MAX_PDF_PROMPT_TEXT_LENGTH } from './pdf-text.ts';

test('keeps short PDF text intact', () => {
  assert.deepEqual(summarizePdfPages(['  Testo breve  ']), { text: 'Testo breve', summarized: false });
});

test('summarizes long PDF text within budget while retaining relevant lines from each page', () => {
  const pages = [
    `GIOVEDÌ 15 OTTOBRE\nTALK ORE 20:30\n${'Descrizione del primo evento. '.repeat(60)}`,
    `DOMENICA 25 OTTOBRE\nVISITA GUIDATA ORE 10:00\n${'Descrizione dell’ultimo evento. '.repeat(60)}`,
  ];
  const result = summarizePdfPages(pages, 300);

  assert.ok(result.text.length <= 300);
  assert.equal(result.summarized, true);
  assert.match(result.text, /GIOVEDÌ 15 OTTOBRE/);
  assert.match(result.text, /DOMENICA 25 OTTOBRE/);
  assert.match(result.text, /Pagina 2/);
});

test('rejoins multi-line uppercase event titles and excludes date and type labels', () => {
  const titles = extractPdfTitleCandidates([
    'GIOVEDÌ 15 OTTOBRE\nTALK - ore 20:30\nI GHIACCI DI MARTE:\nALLA SCOPERTA DEL PIANETA ROSSO\nStefano Bonetti\nFESTIVAL DELLA SCIENZA',
  ]);

  assert.deepEqual(titles, ['I GHIACCI DI MARTE: ALLA SCOPERTA DEL PIANETA ROSSO']);
});

test('recognizes obvious PDF section headings without filtering named activities', () => {
  assert.equal(isNonEventPdfTitle('I luoghi del festival'), true);
  assert.equal(isNonEventPdfTitle('Lanificio Conte'), true);
  assert.equal(isNonEventPdfTitle('Talk: I Ghiacci di Marte'), false);
  assert.equal(isNonEventPdfTitle('Festival dei musei altovicentino'), false);
});