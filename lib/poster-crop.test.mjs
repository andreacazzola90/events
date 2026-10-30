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

test('recovers all four paper edges from the original inside a coloured story, preserving side and footer content', async () => {
  const bytes = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="576" height="1280">
    <defs><linearGradient id="story" x2="0" y2="1"><stop stop-color="#b82838"/><stop offset="1" stop-color="#531031"/></linearGradient></defs>
    <rect width="576" height="1280" fill="#fafafa"/>
    <rect y="136" width="576" height="1000" fill="url(#story)"/>
    <rect x="68" y="284" width="438" height="96" fill="white"/>
    <rect x="80" y="300" width="40" height="40" fill="#de9656"/>
    <rect x="75" y="380" width="424" height="8" fill="#64213e"/>
    <rect x="75" y="388" width="424" height="608" fill="white"/>
    <rect x="75" y="455" width="424" height="110" fill="#fbeeed"/>
    <rect x="78" y="590" width="14" height="22" fill="#1575b5"/>
    <rect x="110" y="630" width="340" height="140" fill="#317d51"/>
    <rect x="75" y="980" width="424" height="4" fill="#64213e"/>
    <rect x="75" y="984" width="424" height="12" fill="#cccccc"/>
    <rect x="78" y="988" width="14" height="5" fill="#1575b5"/>
    </svg>`)).png().toBuffer();
  for (const approximate of [{ top: 380, height: 600 }, { top: 308, height: 588 }]) {
  for (const learned of [undefined, {
    consistent: true, samples: 3,
    box: { x: 103 / 576, y: approximate.top / 1280, width: 473 / 576, height: approximate.height / 1280 },
  }]) {
    const { image, result, metadata, verifications } = await cropImage(bytes, {
      learned,
      bounds: { x: 103 / 1280, y: approximate.top / 1280, width: 473 / 1280, height: approximate.height / 1280, socialHeaderBottom: approximate.top / 1280 },
    });
    assert.ok(Math.abs(result.box.x * 576 - 75) <= 2, 'Recover the missing left side from the original');
    assert.ok(Math.abs(result.box.y * 1280 - 388) <= 2, 'Exclude the separate social header and divider');
    assert.ok(Math.abs(metadata.width - 424) <= 3, 'Remove the coloured right margin');
    assert.ok(Math.abs(metadata.height - 608) <= 3, 'Recover the footer below the approximate AI box');
    assert.equal(verifications.length, 1);
    assert.equal(verifications[0].width, metadata.width);
    assert.equal(verifications[0].height, metadata.height);
    const { data, info } = await sharp(image).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    for (const [sourceX, sourceY] of [[84, 600], [84, 990]]) {
      const offset = (Math.round(sourceY - result.box.y * 1280) * info.width + Math.round(sourceX - result.box.x * 576)) * info.channels;
      assert.ok(data[offset + 2] > data[offset] + 70, 'Preserve the blue side/footer markers');
    }
  }
  }
});

test('preserves a full-width dark footer when the paper side boundaries continue around it', async () => {
  const bytes = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="700">
    <rect width="400" height="700" fill="#fafafa"/>
    <rect y="80" width="400" height="570" fill="#a42446"/>
    <rect x="50" y="160" width="300" height="420" fill="white"/>
    <rect x="70" y="200" width="230" height="80" fill="#fbeeed"/>
    <rect x="50" y="480" width="300" height="100" fill="#15151b"/>
    <rect x="55" y="555" width="15" height="8" fill="#1575b5"/>
    </svg>`)).png().toBuffer();
  const { metadata, result } = await cropImage(bytes, {
    bounds: { x: 50 / 700, y: 160 / 700, width: 300 / 700, height: 420 / 700, socialHeaderBottom: 160 / 700 },
  });
  assert.ok(Math.abs(metadata.width - 300) <= 2);
  assert.ok(Math.abs(metadata.height - 420) <= 2, 'Dark artwork and footer text belong to the poster');
  assert.ok(Math.abs((result.box.y + result.box.height) * 700 - 580) <= 2);
});
