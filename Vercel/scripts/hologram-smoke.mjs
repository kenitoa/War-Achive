import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, hasTouch: true });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const base = process.env.PUBLIC_PREVIEW_URL ?? 'http://127.0.0.1:3100';
await fs.mkdir('artifacts', { recursive: true });
try {
  await page.goto(`${base}/explore/`);
  const launchers = page.locator('.history-launcher');
  for (let war = 0; war < 3; war++) {
    await launchers.nth(war).click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor();
    assert.equal(await dialog.locator('.hologram-slide[aria-hidden="false"]').count(), 1);
    assert.equal(await dialog.getByRole('button', { name: '이전 사건', exact: true }).isDisabled(), true);
    await page.keyboard.press('ArrowRight');
    assert.equal(await dialog.locator('.hologram-chapters button[aria-current]').getAttribute('aria-label'), await dialog.locator('.hologram-chapters button').nth(1).getAttribute('aria-label'));
    await page.keyboard.press('End');
    assert.equal(await dialog.getByRole('button', { name: '다음 사건', exact: true }).isDisabled(), true);
    await page.keyboard.press('Home');
    assert.ok((await dialog.getByRole('link', { name: '해설 출처 ↗' }).getAttribute('href')).startsWith('https://'));
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('dialog').open);
    await page.waitForFunction(() => document.body.style.overflow !== 'hidden');
    assert.equal(await launchers.nth(war).evaluate(element => document.activeElement === element), true);
    assert.notEqual(await page.evaluate(() => document.body.style.overflow), 'hidden');
  }
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await launchers.first().click();
    const stage = page.locator('.hologram-stage');
    await stage.dispatchEvent('touchstart', { touches: [{ identifier: 1, clientX: 250, clientY: 250 }] });
    await stage.dispatchEvent('touchend', { changedTouches: [{ identifier: 1, clientX: 100, clientY: 255 }] });
    assert.equal(await page.locator('.hologram-chapters button[aria-current]').getAttribute('aria-label'), await page.locator('.hologram-chapters button').nth(1).getAttribute('aria-label'));
    for (const chapter of await page.locator('.hologram-chapters button').all()) {
      await chapter.click();
      assert.ok(await page.locator('.hologram-slide[aria-hidden="false"]').evaluate(element => element.scrollHeight <= element.clientHeight + 1));
    }
    await page.keyboard.press('Home');
    await page.waitForTimeout(450);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: `artifacts/hologram-${width}.png` });
    await page.keyboard.press('Escape');
  }
  assert.deepEqual(errors, []);
  console.log('PASS: three wars, boundaries, keyboard, focus return, swipe, responsive layouts, source links');
} finally { await browser.close(); }

