// Compiled into the native-ui-smoke binary only. Exercise normal controls with
// native IPC, the embedded assets, the release CSP, and the platform's WebView.
window.addEventListener('DOMContentLoaded', async () => {
  const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  async function waitFor(description, find) {
    for (let attempt = 0; attempt < 200; attempt++) {
      const found = find();
      if (found) return found;
      const alert = document.querySelector('[role="alert"]');
      if (alert) throw new Error(alert.textContent);
      await pause(100);
    }
    throw new Error('Timed out waiting for ' + description + '. ' + document.body.innerText.slice(-500));
  }
  function clickButton(name) {
    return waitFor(name, () => [...document.querySelectorAll('button')].find((el) =>
      !el.disabled && (el.getAttribute('aria-label') || el.textContent.trim()) === name,
    )).then((el) => el.click());
  }
  const pageTwo = () => document.querySelector('canvas[aria-label^="Original PDF, page 2 of "]');

  try {
    const uri = new URL(location.href);
    if (uri.hostname !== 'tauri.localhost' && !(uri.protocol === 'tauri:' && uri.hostname === 'localhost')) {
      throw new Error('Expected the packaged app origin. Got ' + location.href);
    }
    await clickButton('Read the sample');
    await waitFor('reflowable book text', () =>
      document.querySelector('article[aria-label="Book text"]')?.textContent.trim().length > 5);
    await clickButton('View original PDF');
    await waitFor('first original page', () => document.querySelector('canvas[aria-label^="Original PDF, page 1 of "]'));
    await clickButton('Next page');
    const canvas = await waitFor('second original page', pageTwo);
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let ink = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index] < 150 && pixels[index + 3] > 100) ink++;
    }
    if (ink < 100) throw new Error('The original PDF rendered a blank page.');
    await clickButton('Add bookmark');
    await waitFor('saved bookmark', () => document.querySelector('button[aria-label="Remove bookmark"]'));
    await clickButton('Library');
    await clickButton('Continue reading');
    await waitFor('restored original page', pageTwo);
    await waitFor('restored bookmark', () => document.querySelector('button[aria-label="Remove bookmark"]'));
    document.title = 'x-reader smoke passed';
  } catch (error) {
    document.title = 'x-reader smoke failed: ' + String(error);
  }
}, { once: true });
