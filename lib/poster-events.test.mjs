import assert from 'node:assert/strict';
import { test } from 'node:test';
import { groupPosterEventsByDay } from './poster-events.ts';

const event = (title, date, time, location, description = '') => ({
  title, date, time, location, description, organizer: '', category: 'cultura', price: '', rawText: '',
});

test('combines same-poster activities on the same day without losing their details', () => {
  const events = [
    { ...event('Saluto del sindaco', '2026-11-25', '10:00', 'Biblioteca', 'Presentazione del progetto'), seriesTitle: 'Contro la violenza sulle donne' },
    { ...event('Un tè con Donnedirose', '25/11/2026', '16:00', 'Biblioteca'), seriesTitle: 'Contro la violenza sulle donne' },
    { ...event('Incontro', '2026-11-25', '10:00', 'ITIS Luzzati', 'Incontro con Silvia'), seriesTitle: 'Contro la violenza sulle donne' },
    event('Altro giorno', '2026-11-28', '20:00', 'Biblioteca'),
  ];
  const grouped = groupPosterEventsByDay(events);
  assert.equal(grouped.length, 2);
  assert.equal(grouped[0].title, 'Contro la violenza sulle donne');
  for (const value of ['Saluto del sindaco', 'Un tè con Donnedirose', 'Incontro', '10:00', '16:00', 'Biblioteca', 'ITIS Luzzati', 'Presentazione del progetto', 'Incontro con Silvia']) {
    assert.ok(grouped[0].description.includes(value), value);
  }
  assert.equal(grouped[1], events[3]);
});

test('does not group missing or invalid dates', () => {
  const events = [event('A', '', '10:00', 'A'), event('B', '', '11:00', 'B'), event('C', '2026-02-31', '', 'C')];
  assert.deepEqual(groupPosterEventsByDay(events), events);
});
