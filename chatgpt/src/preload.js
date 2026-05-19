const { webFrame } = require('electron');

// All overrides run in the main world (not the isolated preload world) so that
// page scripts — including Google's sign-in detection — actually see them.
webFrame.executeJavaScript(`
  (function () {
    // 1. webdriver flag — primary automation signal
    try {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined, configurable: true });
    } catch (_) {}

    // 2. userAgentData.brands — Electron lists itself here; Google checks for it
    try {
      const brands = [
        { brand: 'Not/A)Brand',   version: '8'   },
        { brand: 'Chromium',      version: '126' },
        { brand: 'Google Chrome', version: '126' },
      ];
      const fullList = [
        { brand: 'Not/A)Brand',   version: '8.0.0.0'          },
        { brand: 'Chromium',      version: '126.0.6478.114'   },
        { brand: 'Google Chrome', version: '126.0.6478.114'   },
      ];
      const uad = {
        brands,
        mobile: false,
        platform: 'Linux',
        getHighEntropyValues: (hints) => Promise.resolve({
          architecture: 'x86', bitness: '64', brands, fullVersionList: fullList,
          mobile: false, model: '', platform: 'Linux', platformVersion: '6.6.0',
          uaFullVersion: '126.0.6478.114', wow64: false,
        }),
        toJSON: () => ({ brands, mobile: false, platform: 'Linux' }),
      };
      Object.defineProperty(navigator, 'userAgentData', { get: () => uad, configurable: true });
    } catch (_) {}
  })();
`).catch(() => {});
