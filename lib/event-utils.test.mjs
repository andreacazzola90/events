import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getEventStartTime } from './event-display.ts';
import { normalizeEventTitle } from './event-title.ts';

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