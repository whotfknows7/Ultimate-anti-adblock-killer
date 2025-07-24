(function() {
  'use strict';
  
  // This script will only run if the correct mode is selected.
  chrome.storage.sync.get('config', ({ config }) => {
    if (!config) return; // Exit if no config is found
    
    const mode = config.mode;
    const isEnabled = (
      mode === 'heavy' ||
      mode === 'extreme' ||
      (mode === 'custom' && config.custom.userAgentSpoofing)
    );
    
    if (!isEnabled) {
      return; // Do not execute any of the logic below
    }
    
    // If enabled, proceed with initialization.
    initialize();
  });
  
  function initialize() {
    const log = (...args) => console.debug('[User-Agent Switcher]', ...args);
    
    const agents = {
      // A modern Windows 11 Chrome User-Agent
      chrome_win: {
        ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        platform: "Win32",
        vendor: "Google Inc.",
        brands: [
          { brand: "Chromium", version: "125" },
          { brand: "Google Chrome", version: "125" },
          { brand: "Not-A.Brand", version: "99" }
        ],
        mobile: false
      },
      // A modern Firefox on Windows
      firefox_win: {
        ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0",
        platform: "Win32",
        vendor: "", // Firefox leaves vendor blank
        brands: [ // Firefox doesn't typically support userAgentData, but we can provide a generic fallback
          { brand: "Not-A.Brand", version: "99" }
        ],
        mobile: false
      },
      // A modern Safari on macOS
      safari_mac: {
        ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15",
        platform: "MacIntel",
        vendor: "Apple Computer, Inc.",
        brands: [
          { brand: "AppleWebKit", version: "605" },
          { brand: "Not-A.Brand", version: "99" }
        ],
        mobile: false
      },
      // A modern Chrome on Android
      chrome_android: {
        ua: "Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36",
        platform: "Linux armv8l",
        vendor: "Google Inc.",
        brands: [
          { brand: "Chromium", version: "125" },
          { brand: "Google Chrome", version: "125" },
          { brand: "Not-A.Brand", version: "99" }
        ],
        mobile: true
      }
    };
    
    const agentKeys = Object.keys(agents);
    const selectedKey = agentKeys[Math.floor(Math.random() * agentKeys.length)];
    const spoof = agents[selectedKey];
    
    // Helper to safely spoof a property
    const spoofProperty = (object, property, value) => {
      try {
        Object.defineProperty(object, property, {
          get: () => value,
          configurable: true
        });
      } catch (e) {
        log(`Failed to spoof property: ${property}`);
      }
    };
    
    // --- Apply Spoofing ---
    
    // 1. Basic Navigator properties
    spoofProperty(navigator, 'userAgent', spoof.ua);
    spoofProperty(navigator, 'vendor', spoof.vendor);
    spoofProperty(navigator, 'platform', spoof.platform);
    
    // 2. Advanced `userAgentData` for modern browsers
    if ('userAgentData' in navigator) {
      spoofProperty(navigator, 'userAgentData', {
        brands: spoof.brands,
        mobile: spoof.mobile,
        platform: spoof.platform,
        // Mock the getHighEntropyValues function
        getHighEntropyValues: (hints) => Promise.resolve({
          platform: spoof.platform,
          platformVersion: spoof.mobile ? "14.0.0" : "10.0.0",
          architecture: "x86",
          model: spoof.mobile ? "Pixel 8 Pro" : "",
          uaFullVersion: "125.0.6422.142",
          bitness: "64",
          wow64: false,
          // Return brands and mobile status as well, as is common
          brands: spoof.brands,
          mobile: spoof.mobile,
        })
      });
    }
    
    log(`✅ Initialized successfully. Spoofing as: ${selectedKey}`);
  }
})();