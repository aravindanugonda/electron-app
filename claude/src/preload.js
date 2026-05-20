const { webFrame } = require('electron');

webFrame.executeJavaScript(`
  (function () {
    try {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined, configurable: true });
    } catch (_) {}

    try {
      const brands = [
        { brand: 'Not A(Brand',   version: '8'   },
        { brand: 'Chromium',      version: '132' },
        { brand: 'Google Chrome', version: '132' },
      ];
      const fullList = [
        { brand: 'Not A(Brand',   version: '8.0.0.0'          },
        { brand: 'Chromium',      version: '132.0.6834.110'   },
        { brand: 'Google Chrome', version: '132.0.6834.110'   },
      ];
      const uad = {
        brands,
        mobile: false,
        platform: 'Linux',
        getHighEntropyValues: (hints) => Promise.resolve({
          architecture: 'x86', bitness: '64', brands, fullVersionList: fullList,
          mobile: false, model: '', platform: 'Linux', platformVersion: '6.6.0',
          uaFullVersion: '132.0.6834.110', wow64: false,
        }),
        toJSON: () => ({ brands, mobile: false, platform: 'Linux' }),
      };
      Object.defineProperty(navigator, 'userAgentData', { get: () => uad, configurable: true });
    } catch (_) {}
  })();
`).catch(() => {});
