import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractEventImageFromHtml, selectEventImage } from './event-image.ts';

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

test('extracts social image metadata regardless of attribute order', () => {
  const html = `<meta content='/poster.jpg' property='og:image'>
    <meta name="twitter:image" content="https://cdn.example.com/share.jpg">`;

  assert.equal(extractEventImageFromHtml(html, 'https://example.com/events/123'), 'https://example.com/poster.jpg');
});

test('does not fall back to an arbitrary first image in the HTTP scraper', () => {
  assert.equal(extractEventImageFromHtml(
    '<img src="https://example.com/logo.png">',
    'https://example.com/events/123',
  ), null);
});