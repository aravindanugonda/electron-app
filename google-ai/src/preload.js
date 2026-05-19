const { webFrame } = require('electron');

webFrame.executeJavaScript(`
  (function () {
    try {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined, configurable: true });
    } catch (_) {}

    // --- Fix: citation links causing jump-to-top ---
    // Three causes covered:
    //   1. href="#" / href="" anchor clicks → preventDefault via capture listener
    //   2. Google JS changing location.hash to "" → block via hashchange
    //   3. hover triggering focus → override focus() to always set preventScroll:true

    // (1) Capture-phase click on any href="#" or href="" link
    document.addEventListener('click', function (e) {
      var a = e.target && e.target.closest ? e.target.closest('a') : null;
      if (a) {
        var h = a.getAttribute('href');
        if (h === '#' || h === '') e.preventDefault();
      }
    }, true);

    // (2) Block hash changes that reset the page to the top
    window.addEventListener('hashchange', function (e) {
      var hash = window.location.hash;
      if (hash === '' || hash === '#') {
        try { history.replaceState(null, '', e.oldURL || window.location.pathname + window.location.search); } catch (_) {}
      }
    }, true);

    // (3) Prevent focus() from auto-scrolling — covers hover→focus→scroll pattern
    try {
      var _origFocus = HTMLElement.prototype.focus;
      HTMLElement.prototype.focus = function (opts) {
        _origFocus.call(this, Object.assign({}, opts, { preventScroll: true }));
      };
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
