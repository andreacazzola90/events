import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPublicEventAnnouncement, permittedAnnouncementText, sanitizePersonalTelegramText } from './personal-telegram-policy.ts';

test('only date-backed public event material with a venue is retained', () => {
  const post = 'Concerto in programma\nData: 12 giugno 2027\nPresso Teatro Comunale, ingresso libero';
  assert.equal(isPublicEventAnnouncement(post), true);
  assert.match(permittedAnnouncementText(post), /12 giugno 2027/);
  assert.equal(isPublicEventAnnouncement('Ciao, ci vediamo al concerto sabato.'), false);
  assert.equal(isPublicEventAnnouncement('Festa privata 12 giugno 2027 presso casa mia, solo invitati.'), false);
});

test('personal identifiers and links are removed before event text can be submitted', () => {
  const safe = sanitizePersonalTelegramText('Concerto @organizer +39 333 1234567 info@example.org https://t.me/group');
  assert.doesNotMatch(safe, /@organizer|333|example\.org|t\.me/);
});

test('numeric event dates survive redaction and private qualifiers cannot disappear in line filtering', () => {
  for (const date of ['2027-06-12', '12.06.2027', '12-06-2027', '12/06/2027']) {
    assert.match(permittedAnnouncementText(`Festival ${date} presso Teatro Comunale`), /2027/);
  }
  assert.equal(permittedAnnouncementText('Festival 12 giugno 2027 presso Teatro Comunale\nSolo invitati'), '');
});
