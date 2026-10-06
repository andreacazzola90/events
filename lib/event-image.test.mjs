import assert from 'node:assert/strict';
import { test } from 'node:test';
import { selectEventImage } from './event-image.ts';

test('prefers event structured data over generic social metadata', () => {
  assert.equal(selectEventImage([
    { url: 'https://cdn.example.com/share.jpg', source: 'og-image' },
    { url: 'https://cdn.example.com/poster.jpg', source: 'event-schema' },
  ], 'https://example.com/events/123'), 'https://cdn.example.com/poster.jpg');
});

test('rejects generic assets and unsupported URL schemes', () => {
  assert.equal(selectEventImage([
    { url: '/assets/logo.png', source: 'og-image' },
    { url: 'javascript:alert(1)', source: 'event-schema' },
  ], 'https://example.com/events/123'), null);
});

test('resolves relative event image URLs against the event page', () => {
  assert.equal(selectEventImage([
    { url: '../uploads/poster.jpg', source: 'event-schema' },
  ], 'https://example.com/events/123'), 'https://example.com/uploads/poster.jpg');
});