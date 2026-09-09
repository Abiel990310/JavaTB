import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await b.newPage({ viewport: { width: 1200, height: 900 } });
await page.goto('http://localhost:4190/foundations/values-and-variables/', { waitUntil: 'networkidle' });

// A long sample, the kind a reader actually edits.
const runner = page.locator('tb-runner').nth(1);
await runner.locator('button', { hasText: 'Edit' }).click();
await page.waitForTimeout(400);
const ta = runner.locator('textarea.editor__input').first();
const hl = runner.locator('pre.editor__highlight').first();

const geo = async (label) => {
  const g = await ta.evaluate((el) => {
    const pre = el.previousElementSibling;
    return {
      taH: el.getBoundingClientRect().height,
      taScrollH: el.scrollHeight,
      taClientH: el.clientHeight,
      preH: pre.getBoundingClientRect().height,
      clipped: el.scrollHeight > el.clientHeight + 2,
      lines: el.value.split('\n').length,
      preText: (pre.textContent || '').split('\n').length,
    };
  });
  console.log(label, JSON.stringify(g));
  return g;
};
await geo('initial      ');

// Click the LAST visible line, not the third.
const box = await hl.boundingBox();
const m = await hl.evaluate((el) => { const c = getComputedStyle(el);
  return { pt: parseFloat(c.paddingTop), pl: parseFloat(c.paddingLeft), lh: parseFloat(c.lineHeight) }; });
const nLines = await ta.evaluate((el) => el.value.split('\n').length);
await page.mouse.click(box.x + m.pl + 1, box.y + m.pt + m.lh * (nLines - 1) + m.lh / 2);
await page.waitForTimeout(120);
console.log('click last line', JSON.stringify(await ta.evaluate((el) => ({
  focused: document.activeElement === el,
  line: el.value.slice(0, el.selectionStart).split('\n').length,
}))));

// Now type several new lines — does the box grow, or does the text vanish?
await page.keyboard.press('End');
for (let i = 0; i < 6; i++) await page.keyboard.type('\n// new line ' + i);
await page.waitForTimeout(200);
const after = await geo('after typing ');
console.log('CARET VISIBLE?', JSON.stringify(await ta.evaluate((el) => {
  const r = el.getBoundingClientRect();
  return { taBottom: Math.round(r.bottom), viewportH: window.innerHeight,
           contentOverflow: el.scrollHeight - el.clientHeight };
})));
await page.screenshot({ path: '/tmp/claude-0/-home-user-CppTB/d76038d9-5424-5365-9bee-6bab62ff25c7/scratchpad/editor.png' });
await b.close();
