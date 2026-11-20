import assert from 'node:assert/strict';
import { test } from 'node:test';
import { collectVisitSchioGalleryImages, extractEventImageFromHtml, selectEventImage } from './event-image.ts';

function domNode(name, children = [], attributes = {}) {
  const node = {
    name,
    children,
    shadowRoot: null,
    currentSrc: attributes.currentSrc ?? '',
    getAttribute: key => attributes[key] ?? null,
    querySelectorAll(selector) {
      const matches = [];
      function walk(parent, inPicture = false) {
        for (const child of parent.children) {
          if (selector === '*' || selector === child.name ||
              (selector === 'picture source' && child.name === 'source' && inPicture)) {
            matches.push(child);
          }
          walk(child, inPicture || child.name === 'picture');
        }
      }
      walk(this);
      return matches;
    },
  };
  return node;
}

function collectFrom(hostname, document) {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  try {
    globalThis.window = { location: { hostname } };
    globalThis.document = document;
    return collectVisitSchioGalleryImages();
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
}

test('collects gallery images through open shadow roots and prefers them over generic metadata', () => {
  const gallery = domNode('dw-gen-gallery-image', [
    domNode('picture', [
      domNode('source', [], { srcset: '//resc.deskline.net/images/TRN/event.jpg 1x, /event-large.jpg 2x' }),
      domNode('img', [], { src: 'data:image/gif;base64,placeholder', currentSrc: 'https://resc.deskline.net/images/TRN/event.jpg' }),
    ]),
  ]);
  const widget = domNode('dw-app-container');
  widget.shadowRoot = domNode('#shadow-root', [gallery]);
  const document = domNode('#document', [widget, domNode('img', [], { currentSrc: 'https://example.com/unrelated.jpg' })]);
  const candidates = collectFrom('www.visitschio.it', document);

  assert.deepEqual(candidates.map(candidate => candidate.url), [
    'https://resc.deskline.net/images/TRN/event.jpg',
    '//resc.deskline.net/images/TRN/event.jpg',
    '/event-large.jpg',
  ]);
  assert.equal(selectEventImage([
    { url: '/generic.jpg', source: 'event-schema' },
    { url: '/share.jpg', source: 'og-image' },
    ...candidates,
  ], 'https://www.visitschio.it/events'), 'https://resc.deskline.net/images/TRN/event.jpg');
});

test('uses picture sources when currentSrc is a placeholder, and keeps existing fallbacks', () => {
  const gallery = domNode('dw-gen-gallery-image');
  gallery.shadowRoot = domNode('#shadow-root', [domNode('picture', [
    domNode('source', [], { srcset: '//resc.deskline.net/images/TRN/poster.jpg 800w' }),
    domNode('img', [], { currentSrc: 'data:image/gif;base64,R0lGODlh' }),
  ])]);
  const document = domNode('#document', [gallery]);
  const candidates = collectFrom('visitschio.it', document);
  assert.equal(selectEventImage(candidates, 'https://visitschio.it/events'), 'https://resc.deskline.net/images/TRN/poster.jpg');
  assert.equal(selectEventImage([
    { url: 'data:image/gif;base64,R0lGODlh', source: 'visitschio-gallery' },
    { url: '/placeholder.jpg', source: 'visitschio-gallery' },
    { url: '/event.jpg', source: 'event-schema' },
  ], 'https://visitschio.it/events'), 'https://visitschio.it/event.jpg');
});

test('does not collect galleries on other domains and retains provider ordering', () => {
  const document = domNode('#document', [domNode('dw-gen-gallery-image', [
    domNode('img', [], { currentSrc: 'https://example.com/other.jpg' }),
  ])]);
  for (const hostname of ['dice.fm', 'notvisitschio.it', 'visitschio.it.example.com']) {
    assert.deepEqual(collectFrom(hostname, document), []);
  }
  assert.equal(selectEventImage([
    { url: '/og.jpg', source: 'og-image' },
    { url: '/provider.jpg', source: 'provider-event' },
    { url: '/schema.jpg', source: 'event-schema' },
  ], 'https://dice.fm/event'), 'https://dice.fm/schema.jpg');
});

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

test('decodes HTML entities in signed social image URLs before URL parsing', () => {
  assert.equal(extractEventImageFromHtml(
    '<meta property="og:image" content="https://images.example/poster.jpg?size=large&amp;oh=signature&#38;oe=expiry">',
    'https://www.facebook.com/events/123/',
  ), 'https://images.example/poster.jpg?size=large&oh=signature&oe=expiry');
});