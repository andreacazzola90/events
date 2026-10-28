import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getEventStartTime, sameEventStartTime, splitEventsByTime } from './event-display.ts';
import { normalizeEventTitle } from './event-title.ts';

test('keeps same-day events separate and expands explicit time lists', () => {
  const first = { title: 'Concerto', date: '2026-10-31', time: '18:00' };
  const second = { ...first, time: '21:00' };
  const listed = { ...first, time: '20:00 / 22:30' };

  assert.deepEqual(
    splitEventsByTime([first, second, listed]).map(event => event.time),
    ['18:00', '21:00', '20:00', '22:30'],
  );
});

test('keeps a single event time range intact', () => {
  const event = { title: 'Concerto', date: '2026-10-31', time: 'dalle 20:00 alle 23:00' };
  assert.deepEqual(splitEventsByTime([event]), [event]);
});

test('only treats same-title events as duplicates when their start times match', () => {
  assert.equal(sameEventStartTime('20:00-23:00', '20:00'), true);
  assert.equal(sameEventStartTime('20:00', '21:00'), false);
  assert.equal(sameEventStartTime('', '21:00'), false);
});

test('returns only the first valid event time', () => {
  assert.equal(getEventStartTime('dalle 20:30 alle 23:00'), '20:30');
  assert.equal(getEventStartTime('18.15 - 21.00'), '18:15');
  assert.equal(getEventStartTime('h 9'), '09:00');
  assert.equal(getEventStartTime('21:00 / 22:30'), '21:00');
});

test('omits missing or invalid event times', () => {
  assert.equal(getEventStartTime('non trovato'), null);
  assert.equal(getEventStartTime('Tutto il giorno'), null);
  assert.equal(getEventStartTime('25:00'), null);
});

test('removes a matching date prefix from an event title', () => {
  assert.equal(normalizeEventTitle('## SABATO 31 OTTOBRE A VOLTE RITORNANO', '2026-10-31'), 'A VOLTE RITORNANO');
  assert.equal(normalizeEventTitle('31/10/2026 - A VOLTE RITORNANO', '2026-10-31'), 'A VOLTE RITORNANO');
  assert.equal(normalizeEventTitle('Venerdì 30 ottobre A VOLTE RITORNANO', '2026-10-31'), 'Venerdì 30 ottobre A VOLTE RITORNANO');
});