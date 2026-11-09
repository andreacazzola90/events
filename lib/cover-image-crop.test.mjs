import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isCoverImageCrop } from './cover-image-crop.ts';

test('accepts crop bounds normalized to the original image', () => {
  assert.equal(isCoverImageCrop({ x: 0.1, y: 0.2, width: 0.5, height: 0.4 }), true);
  assert.equal(isCoverImageCrop({ x: 0, y: 0, width: 1, height: 1 }), true);
});

test('rejects invalid or out-of-bounds crop coordinates', () => {
  for (const crop of [
    null,
    {},
    { x: -0.1, y: 0, width: 0.5, height: 0.5 },
    { x: 0.6, y: 0, width: 0.5, height: 0.5 },
    { x: 0, y: 0, width: 0, height: 0.5 },
    { x: 0, y: 0, width: Number.NaN, height: 0.5 },
  ]) {
    assert.equal(isCoverImageCrop(crop), false);
  }
});
