import { chromium, devices } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

for (const name of ['Pixel 7', 'iPhone 13']) {
  const ctx = await b.newContext({ ...devices[name] });
  const page = await ctx.newPage();
  await page.goto('http://localhost:4190/foundations/hello-jvm/', { waitUntil: 'networkidle' });
  const runner = page.locator('tb-runner').first();
  try {
    await runner.locator('button', { hasText: 'Edit' }).tap();
    await page.waitForTimeout(400);
    const ta = runner.locator('textarea.editor__input').first();
    const hl = runner.locator('pre.editor__highlight').first();
    const box = await hl.boundingBox();
    const m = await hl.evaluate((el) => { const c = getComputedStyle(el);
      return { pt: parseFloat(c.paddingTop), pl: parseFloat(c.paddingLeft), lh: parseFloat(c.lineHeight) }; });
    await page.touchscreen.tap(box.x + m.pl + 2, box.y + m.pt + m.lh * 2 + m.lh / 2);
    await page.waitForTimeout(200);
    const r = await ta.evaluate((el) => ({
      focused: document.activeElement === el,
      line: el.value.slice(0, el.selectionStart).split('\n').length,
      taH: Math.round(el.getBoundingClientRect().height),
      preH: Math.round(el.previousElementSibling.getBoundingClientRect().height),
      taW: Math.round(el.getBoundingClientRect().width),
      preScrollW: el.previousElementSibling.scrollWidth,
      taScrollW: el.scrollWidth,
    }));
    console.log(name.padEnd(10), JSON.stringify(r));
  } catch (e) { console.log(name.padEnd(10), 'ERROR', e.message.split('\n')[0]); }
  await ctx.close();
}
await b.close();
