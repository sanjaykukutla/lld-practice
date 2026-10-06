const { _electron: electron } = require('playwright');

(async () => {
  const app = await electron.launch({ args: ['test_f.js'] });
  const window = await app.firstWindow();
  await window.waitForLoadState('domcontentloaded');
  await window.waitForTimeout(2000);

  await window.screenshot({ path: 'before-click.png' });
  console.log('Saved before-click.png');

  const selector = 'button, [role="button"], a, input[type="button"], input[type="submit"]';
  const clicked = await window.$$eval(selector, (els) => {
    const target = els[0];
    if (!target) return null;

    const description = { tag: target.tagName, text: (target.innerText || target.value || '').trim() };
    target.click();
    return description;
  });

  if (clicked) {
    console.log('Clicked element (regardless of visibility):', JSON.stringify(clicked));
  } else {
    console.log('No clickable element found at all - no click performed');
  }

  await window.waitForTimeout(1500);
  await window.screenshot({ path: 'after-click.png' });
  console.log('Saved after-click.png');

  await app.close();
})();
