import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildRescanProposal, matchRescannedEvent } from './event-rescan.ts';

const current = {
  title: 'Concerto in piazza',
  date: '2026-10-10',
  time: '20:00',
  location: 'Teatro Civico di Schio',
  description: 'Descrizione originale',
  organizer: 'Comune',
  category: 'musica',
  price: 'Gratuito',
  rawText: '',
  sourceUrl: 'https://events.example/program.pdf',
};

test('rescan matches only the selected activity when several events share a date', () => {
  const candidates = [
    { ...current, title: 'Mostra di fotografia', date: current.date, time: '18:00' },
    { ...current, title: 'Concerto in piazza', date: current.date, time: '21:00', location: 'Teatro Civico di Schio' },
  ];
  const match = matchRescannedEvent(current, candidates);
  assert.equal(match.status, 'matched');
  assert.equal(match.event.time, '21:00');
});

test('rescan refuses an ambiguous event match and never proposes fields for it', () => {
  const candidates = [
    { ...current, time: '21:00' },
    { ...current, time: '21:00' },
  ];
  assert.deepEqual(matchRescannedEvent(current, candidates), { status: 'ambiguous' });
});

test('rescan refuses an exact title with only discordant event details', () => {
  const candidate = {
    ...current,
    title: current.title,
    date: '2027-04-20',
    time: '18:00',
    location: 'Palazzo Toaldi Capra',
  };
  assert.deepEqual(matchRescannedEvent(current, [candidate]), { status: 'missing' });
});

test('rescan matches a correction when another event detail corroborates the title', () => {
  const candidate = {
    ...current,
    title: current.title,
    date: '2027-04-20',
    time: '21:00',
    location: current.location,
  };
  const match = matchRescannedEvent(current, [candidate]);
  assert.equal(match.status, 'matched');
  if (match.status === 'matched') assert.equal(match.event, candidate);
});

test('rescan proposal contains only non-empty changed fields and leaves source metadata untouched', () => {
  const proposal = buildRescanProposal(current, {
    ...current,
    title: 'Concerto in piazza',
    time: '21:00',
    location: 'non trovato',
    description: 'Descrizione aggiornata',
    imageUrl: 'https://images.example/poster.jpg',
  });
  assert.deepEqual(proposal, { description: 'Descrizione aggiornata', time: '21:00' });
});
