const { _electron: electron } = require('playwright');

(async () => {
  const app = await electron.launch({ args: ['test_f.js'] });
  const window = await app.firstWindow();
  await window.waitForLoadState('domcontentloaded');

  await window.screenshot({ path: 'before-click.png' });
  console.log('Saved before-click.png');

  const selector = 'button, [role="button"], a, input[type="button"], input[type="submit"]';
  const clickable = await window.$$eval(selector, (els) =>
    els.map((el) => ({ tag: el.tagName, text: (el.innerText || el.value || '').trim() }))
  );
  console.log('Clickable elements found:', JSON.stringify(clickable, null, 2));

  if (clickable.length > 0) {
    await window.locator(selector).first().click();
    console.log('Clicked first element:', JSON.stringify(clickable[0]));
  } else {
    console.log('No clickable elements found in DOM - clicking center of window instead');
    const size = window.viewportSize();
    if (size) {
      await window.mouse.click(size.width / 2, size.height / 2);
    }
  }

  await window.waitForTimeout(1000);
  await window.screenshot({ path: 'after-click.png' });
  console.log('Saved after-click.png');

  await app.close();
})();
