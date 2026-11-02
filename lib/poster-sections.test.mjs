import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import sharp from 'sharp';
import { locateEventSections, readPosterLines, renderPosterSection } from './poster-sections.ts';

const poster = JSON.parse(readFileSync(new URL('./fixtures/poster-sections-cinque-incontri.json', import.meta.url), 'utf8'));
const events = [
  { title: 'Uomo o macchina?', date: '2026-11-03' },
  { title: 'La poesia in forma di canzone', date: '2026-11-10' },
  { title: 'Il paradiso perduto', date: '2026-11-17' },
  { title: 'Non era una Musa', date: '2026-11-24' },
  { title: 'Il nemico non esiste', date: '2026-12-01' },
];
// Real OCR text on the 760x1080 poster: [date line top, bottom of the last detail words].
const expected = [[435, 527], [541, 664], [681, 792], [818, 921], [943, 1044]];

test('locates each event block from its date line to its last detail line', () => {
  const sections = locateEventSections(poster.lines, events, poster);
  assert.deepEqual(sections.map(section => section.index), [0, 1, 2, 3, 4]);
  for (const [position, section] of sections.entries()) {
    const [top, bottom] = expected[position];
    assert.ok(section.top <= top && section.top >= top - 20, `top ${position}: ${section.top}`);
    assert.ok(section.top + section.height >= Math.min(bottom, expected[position + 1]?.[0] ?? bottom) - 2, `bottom ${position}`);
    assert.ok(section.top + section.height <= (expected[position + 1]?.[0] ?? 1070), `bottom ${position} overlaps next`);
    assert.ok(section.left <= 61 && section.left + section.width >= 270 && section.left + section.width < 460, `x ${position}`);
  }
});

test('the last event stops before the poster footer', () => {
  const last = locateEventSections(poster.lines, events, poster).at(-1);
  assert.ok(last.top + last.height < 1050);
});

test('events whose title is not on the poster are omitted', () => {
  const sections = locateEventSections(poster.lines, [{ title: 'Concerto di Natale', date: '2026-12-20' }, events[2]], poster);
  assert.deepEqual(sections.map(section => section.index), [1]);
});

test('matching ignores accents, case and punctuation and works without a date', () => {
  const sections = locateEventSections(poster.lines, [{ title: 'NON ERA UNA MUSA!' }], poster);
  assert.equal(sections.length, 1);
  assert.ok(sections[0].top >= 820 && sections[0].top <= 840);
});

test('side-by-side events are bounded only by anchors in their own column', () => {
  const line = (text, x0, y0) => ({ text, confidence: 95, bbox: { x0, y0, x1: x0 + 200, y1: y0 + 20 },
    words: [{ text, confidence: 95, bbox: { x0, y0, x1: x0 + 200, y1: y0 + 20 } }] });
  const lines = [line('Primo evento', 20, 100), line('Secondo evento', 420, 100), line('dettagli primo', 20, 125),
    line('Terzo evento', 20, 300), line('dettagli secondo', 420, 125), line('altri dettagli secondo', 420, 150)];
  const sections = locateEventSections(lines, [{ title: 'Primo evento' }, { title: 'Secondo evento' }, { title: 'Terzo evento' }],
    { width: 800, height: 600 });
  assert.equal(sections.length, 3);
  assert.ok(sections[0].left + sections[0].width < 420 && sections[1].left > 220);
  assert.ok(sections[0].top + sections[0].height <= 298);
});

const textLine = (text, y0) => ({ text, confidence: 95, bbox: { x0: 20, y0, x1: 300, y1: y0 + 20 },
  words: [{ text, confidence: 95, bbox: { x0: 20, y0, x1: 300, y1: y0 + 20 } }] });

test('events sharing one date heading get separate sections', () => {
  const lines = [textLine('Sabato 3 novembre', 100), textLine('Concerto jazz', 125), textLine('Teatro ragazzi', 150),
    textLine('Domenica 4 novembre', 300), textLine('Mostra fotografica', 325)];
  const sections = locateEventSections(lines, [
    { title: 'Concerto jazz', date: '2026-11-03' }, { title: 'Teatro ragazzi', date: '2026-11-03' },
    { title: 'Mostra fotografica', date: '2026-11-04' }], { width: 800, height: 600 });
  assert.equal(sections.length, 3);
  assert.ok(sections[0].top < 100 && sections[0].top + sections[0].height <= 150);
  assert.ok(sections[1].top > 125 && sections[1].top < 150);
});

test('a title contained in another title keeps its own line', () => {
  const lines = [textLine('Jazz e poesia', 100), textLine('Jazz', 300)];
  const sections = locateEventSections(lines, [{ title: 'Jazz' }, { title: 'Jazz e poesia' }], { width: 800, height: 600 });
  assert.deepEqual(sections.map(section => section.index), [0, 1]);
  assert.ok(sections[0].top > 250 && sections[1].top < 150);
});

test('no OCR lines yields no sections', () => {
  assert.deepEqual(locateEventSections([], events, poster), []);
});

test('rendered section is letterboxed to 16:9 with the poster background', async () => {
  const image = await sharp({ create: { width: 760, height: 1080, background: '#f4efe4', channels: 3 } }).png().toBuffer();
  const output = await renderPosterSection(image, { index: 0, left: 30, top: 420, width: 380, height: 150 });
  const metadata = await sharp(output).metadata();
  assert.equal(metadata.format, 'jpeg');
  assert.ok(Math.abs(metadata.width / metadata.height - 16 / 9) < 0.01);
  const { dominant } = await sharp(output).stats();
  assert.ok(Math.abs(dominant.r - 0xf4) < 12 && Math.abs(dominant.b - 0xe4) < 12);
});

test('OCR rejects promptly on timeout instead of hanging', async () => {
  const image = await sharp({ create: { width: 200, height: 100, channels: 3, background: '#fff' } }).png().toBuffer();
  const started = Date.now();
  await assert.rejects(readPosterLines(image, AbortSignal.timeout(1)), /aborted/);
  assert.ok(Date.now() - started < 5000);
});
