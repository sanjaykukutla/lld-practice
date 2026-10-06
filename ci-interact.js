const { _electron: electron } = require('playwright');
const { execSync } = require('child_process');

function screenshot(path) {
  try {
    execSync(`screencapture -x "${path}"`);
    console.log('Captured full screen ->', path);
  } catch (e) {
    console.log('screencapture failed:', e.message);
  }
}

(async () => {
  const app = await electron.launch({ args: ['test_f.js'] });
  const firstWindow = await app.firstWindow();
  await firstWindow.waitForLoadState('domcontentloaded');

  screenshot('before-click.png');

  console.log('Waiting 10 seconds...');
  await new Promise((r) => setTimeout(r, 10000));

  const windows = app.windows();
  console.log(`Found ${windows.length} window(s) open after waiting`);
  const popup = windows[windows.length - 1];

  const selector = 'button, [role="button"], a, input[type="button"], input[type="submit"]';
  try {
    const clicked = await popup.$$eval(selector, (els) => {
      const target = els[0];
      if (!target) return null;
      const description = { tag: target.tagName, text: (target.innerText || target.value || '').trim() };
      target.click();
      return description;
    });
    console.log(clicked ? `Clicked in popup window: ${JSON.stringify(clicked)}` : 'No clickable element found in popup window');
  } catch (e) {
    console.log('Click attempt failed:', e.message);
  }

  await new Promise((r) => setTimeout(r, 1500));
  screenshot('after-click.png');

  await app.close();
})();
