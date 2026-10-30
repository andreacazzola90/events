import assert from 'node:assert/strict';
import { test } from 'node:test';
import sharp from 'sharp';
import { createVerifiedPosterCrop } from './poster-crop.ts';

async function screenshot({ left = 0, top = 16, right = 18, bottom = 0, background = '#dddddd', detail = '' } = {}) {
  return sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500">
    <rect width="400" height="500" fill="${background}"/>
    <rect x="${left}" y="${top}" width="${400 - left - right}" height="${500 - top - bottom}" fill="#287ab9"/>
    <rect x="${left}" y="260" width="${400 - left - right}" height="${240 - bottom}" fill="#e05238"/>
    ${detail}</svg>`)).png().toBuffer();
}

async function cropImage(bytes, { screenshotUI = true, learned, bounds: extraBounds = {} } = {}) {
  let result;
  const verifications = [];
  const image = await createVerifiedPosterCrop(new File([bytes], 'screen.png', { type: 'image/png' }),
    async (url, prompt) => {
      if (prompt.startsWith('Find the rectangle')) {
        return JSON.stringify({ x: 0, y: 0, width: 0.8, height: 1, confidence: 0.99,
          ...(screenshotUI ? { socialHeaderBottom: 0 } : {}), ...extraBounds });
      }
      verifications.push(await sharp(Buffer.from(url.split(',')[1], 'base64')).metadata());
      return '{"safe":true,"confidence":0.99}';
    }, { title: 'Test', date: '' }, { learned, onSuccess: value => { result = value; } });
  assert.ok(image);
  return { image, result, verifications, metadata: await sharp(image).metadata() };
}

test('removes residual top and right bands before verification and reports exact source coordinates', async () => {
  const { image, result, metadata, verifications } = await cropImage(await screenshot());
  assert.equal(metadata.width, 382);
  assert.equal(metadata.height, 484);
  assert.deepEqual(result.box, { x: 0, y: 16 / 500, width: 382 / 400, height: 484 / 500 });
  assert.deepEqual(verifications.map(({ width, height }) => [width, height]), [[382, 484]]);
  const { data, info } = await sharp(image).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  for (const [x, y] of [[0, 0], [info.width - 1, 0], [0, info.height - 1], [info.width - 1, info.height - 1]]) {
    const offset = (y * info.width + x) * info.channels;
    assert.ok(Math.max(...data.subarray(offset, offset + 3)) - Math.min(...data.subarray(offset, offset + 3)) > 60,
      'No neutral screenshot band may remain in the corners');
  }
});

for (const background of ['#000000', '#ffffff', '#dddddd']) {
  test(`cleans all four screenshot edges (${background})`, async () => {
    const { metadata, result } = await cropImage(await screenshot({ left: 12, top: 16, right: 18, bottom: 20, background }), {
      learned: { consistent: true, samples: 3, box: { x: 0, y: 0, width: 1, height: 1 } },
    });
    assert.equal(metadata.width, 370);
    assert.equal(metadata.height, 464);
    assert.deepEqual(result.box, { x: 12 / 400, y: 16 / 500, width: 370 / 400, height: 464 / 500 });
  });
}

test('handles adjacent bands with different neutral colours', async () => {
  const bytes = await screenshot({ left: 12, top: 16, right: 18, bottom: 20,
    detail: '<rect width="400" height="16" fill="white"/><rect x="382" y="16" width="18" height="484" fill="black"/>' });
  const { metadata, result } = await cropImage(bytes);
  assert.equal(metadata.width, 370);
  assert.equal(metadata.height, 464);
  assert.deepEqual(result.box, { x: 12 / 400, y: 16 / 500, width: 370 / 400, height: 464 / 500 });
});

test('refines JPEG screenshots without leaving sizeable compression-fringe bands', async () => {
  const bytes = await sharp(await screenshot()).jpeg({ quality: 85 }).toBuffer();
  const { metadata, result } = await cropImage(bytes);
  assert.ok(Math.abs(metadata.width - 382) <= 2);
  assert.ok(Math.abs(metadata.height - 484) <= 2);
  assert.equal(result.box.width * 400, metadata.width);
  assert.equal(result.box.height * 500, metadata.height);
});

test('refines learned screenshot crops too', async () => {
  const { metadata, result } = await cropImage(await screenshot(), {
    learned: { consistent: true, samples: 3, box: { x: 0, y: 0, width: 1, height: 1 } },
  });
  assert.equal(metadata.width, 382);
  assert.equal(metadata.height, 484);
  assert.equal(result.method, 'learned');
});

test('does not trim ambiguous oversized margins or a poster without screenshot evidence', async () => {
  for (const options of [{ top: 150, right: 0 }, { top: 0, right: 100 }]) {
    const { metadata } = await cropImage(await screenshot(options));
    assert.equal(metadata.width, 400);
    assert.equal(metadata.height, 500);
  }
  const { metadata } = await cropImage(await screenshot(), { screenshotUI: false });
  assert.equal(metadata.width, 400);
  assert.equal(metadata.height, 500);
});

test('preserves nonuniform essential content at the outer edges', async () => {
  const bytes = await screenshot({ detail: '<rect x="30" y="0" width="30" height="30" fill="#121212"/><rect x="370" y="50" width="30" height="35" fill="#121212"/>' });
  const { metadata } = await cropImage(bytes);
  assert.equal(metadata.width, 400);
  assert.equal(metadata.height, 500);
});

test('preserves gradual neutral artwork gradients', async () => {
  const bytes = await screenshot({ top: 0, right: 0,
    detail: '<defs><linearGradient id="fade" x2="0" y2="1"><stop stop-color="#eeeeee"/><stop offset="1" stop-color="#444444"/></linearGradient></defs><rect width="400" height="160" fill="url(#fade)"/>' });
  const { metadata } = await cropImage(bytes);
  assert.equal(metadata.width, 400);
  assert.equal(metadata.height, 500);
});

test('composes refinement offsets with the initial AI rectangle', async () => {
  const bytes = await screenshot({ left: 20, top: 30, right: 18, bottom: 0,
    detail: '<rect width="400" height="10" fill="#842346"/><rect width="10" height="500" fill="#842346"/>' });
  const { metadata, result } = await cropImage(bytes, { bounds: { x: 0.02, y: 0.02, width: 0.78, height: 0.98 } });
  assert.equal(metadata.width, 362);
  assert.equal(metadata.height, 470);
  assert.deepEqual(result.box, { x: 20 / 400, y: 30 / 500, width: 362 / 400, height: 470 / 500 });
});
