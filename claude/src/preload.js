const { webFrame } = require('electron');

webFrame.executeJavaScript(`
  (function () {
    try {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined, configurable: true });
    } catch (_) {}

    try {
      const brands = [
        { brand: 'Not/A)Brand',   version: '8'   },
        { brand: 'Chromium',      version: '126' },
        { brand: 'Google Chrome', version: '126' },
      ];
      const fullList = [
        { brand: 'Not/A)Brand',   version: '8.0.0.0'        },
        { brand: 'Chromium',      version: '126.0.6478.114' },
        { brand: 'Google Chrome', version: '126.0.6478.114' },
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
