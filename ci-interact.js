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
    const isVisible = (el) => {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.visibility !== 'hidden' &&
        style.display !== 'none' &&
        el.offsetParent !== null
      );
    };

    const visible = els.filter(isVisible);
    const withText = visible.filter((el) => (el.innerText || el.value || '').trim().length > 0);
    const target = withText[0] || visible[0];

    if (!target) return null;

    const description = { tag: target.tagName, text: (target.innerText || target.value || '').trim() };
    target.click();
    return description;
  });

  if (clicked) {
    console.log('Clicked visible element:', JSON.stringify(clicked));
  } else {
    console.log('No visible clickable element found - no click performed');
  }

  await window.waitForTimeout(1500);
  await window.screenshot({ path: 'after-click.png' });
  console.log('Saved after-click.png');

  await app.close();
})();
