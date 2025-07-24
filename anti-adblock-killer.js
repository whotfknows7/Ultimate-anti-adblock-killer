(async function() { // Make sure the main function is async
    'use strict';
    
    // --- Whitelist Check ---
    const { whitelist = [] } = await chrome.storage.sync.get('whitelist');
    if (whitelist.some(d => window.location.hostname.endsWith(d))) {
        return; // Exit if domain is whitelisted
    }
    
    // This script will only run if the correct mode is selected.
    chrome.storage.sync.get('config', ({ config }) => {
        if (!config) return; // Exit if no config is found

        const mode = config.mode;
        const isEnabled = (
            mode === 'standard' ||
            mode === 'heavy' ||
            mode === 'extreme' ||
            (mode === 'custom' && config.custom.antiAdblockKiller)
        );

        if (!isEnabled) {
            return; // Do not execute any of the logic below
        }
        
        // If enabled, proceed with initialization.
        initialize();
    });

    function initialize() {
        const DEBUG = false; // Set to true for verbose logging
        const log = (...args) => (window.__antiKillerDebug || DEBUG) && console.debug('[Anti-Adblock-Killer]', ...args);
        
        // A more robust regex to catch common anti-adblock patterns
        const trapRegex = new RegExp('\\b(ad(s|block|guard|server|remover)|blockadblock|fuckadblock|pagefair|bait|trap|detect|advertisement)\\b', 'i');
        const fakeNativeMap = new WeakMap();

        // Helper to make proxies appear as native code
        const spoofToString = (proxy, nativeFuncString) => {
            fakeNativeMap.set(proxy, `function ${nativeFuncString}() { [native code] }`);
        };
        
        const origToString = Function.prototype.toString;
        Function.prototype.toString = new Proxy(origToString, {
            apply(target, thisArg, args) {
                // If a function has a spoofed string, return it. Otherwise, use the original.
                return fakeNativeMap.has(thisArg) ? fakeNativeMap.get(thisArg) : Reflect.apply(target, thisArg, args);
            }
        });


        // 1️⃣ Hide trap scripts from `document.scripts`
        const originalScriptsDesc = Object.getOwnPropertyDescriptor(Document.prototype, 'scripts');
        if (originalScriptsDesc && originalScriptsDesc.get) {
            Object.defineProperty(document, 'scripts', {
                get() {
                    const scripts = originalScriptsDesc.get.call(this);
                    const filtered = Array.from(scripts).filter(s => !trapRegex.test((s.textContent || '') + (s.src || '')));
                    
                    // Create a fake HTMLCollection to return
                    const fakeCollection = {
                        length: filtered.length,
                        item: i => filtered[i] || null,
                        namedItem: name => filtered.find(s => s.name === name) || null,
                        [Symbol.iterator]: function* () {
                            for (const s of filtered) yield s;
                        }
                    };
                    filtered.forEach((s, i) => fakeCollection[i] = s);
                    Object.setPrototypeOf(fakeCollection, HTMLCollection.prototype);
                    return fakeCollection;
                },
                configurable: true
            });
            log('document.scripts proxy is active.');
        }

        // 2️⃣ Block trap iframes and scripts via `createElement`
        const origCreateElement = Document.prototype.createElement;
        Document.prototype.createElement = new Proxy(origCreateElement, {
            apply(target, thisArg, args) {
                const [tag] = args;
                const element = Reflect.apply(target, thisArg, args);

                if (typeof tag === 'string') {
                    const lowerTag = tag.toLowerCase();
                    if (lowerTag === 'iframe' || lowerTag === 'script') {
                        const origSetAttribute = element.setAttribute.bind(element);
                        element.setAttribute = (name, val) => {
                            if (name.toLowerCase() === 'src' && trapRegex.test(val)) {
                                log(`Blocked trap ${lowerTag} src via setAttribute:`, val);
                                return; // Block by doing nothing
                            }
                            origSetAttribute(name, val);
                        };
                        
                        Object.defineProperty(element, 'src', {
                            set(url) {
                                if (trapRegex.test(url)) {
                                    log(`Blocked trap ${lowerTag} src via property setter:`, url);
                                    // For scripts, we might need to simulate load to prevent errors
                                    if (lowerTag === 'script') setTimeout(() => element.onload?.());
                                } else {
                                    element.setAttribute('src', url);
                                }
                            },
                            get() { return element.getAttribute('src') || ''; },
                            configurable: true
                        });
                    }
                }
                return element;
            }
        });
        log('createElement proxy is active for iframes and scripts.');

        // 3️⃣ Basic fingerprint and ad-blocker detection spoofing
        Object.defineProperty(navigator, 'webdriver', { get: () => false, configurable: true });
        if (navigator.permissions) {
            const origQuery = navigator.permissions.query.bind(navigator.permissions);
            navigator.permissions.query = params =>
                (params?.name && ['notifications'].includes(params.name))
                    ? Promise.resolve({ state: 'prompt' }) // A common check
                    : origQuery(params);
        }

        // 4️⃣ Remove inline script traps via MutationObserver
        new MutationObserver(mutations => {
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (node.tagName === 'SCRIPT' && trapRegex.test(node.textContent)) {
                        log('Removed inline script trap:', node.textContent.substring(0, 100));
                        node.remove();
                    }
                }
            }
        }).observe(document.documentElement, { childList: true, subtree: true });

        // 5️⃣ Heal overlays, pop-ups, and scroll/blur locks
        let lastScan = 0;
        const healPage = (root = document) => {
            try {
                // Remove typical overlay elements
                root.querySelectorAll('[id*="overlay"], [class*="overlay"], [id*="popup"], [class*="popup"]').forEach(el => {
                    const style = getComputedStyle(el);
                    if (style.position === 'fixed' && parseInt(style.zIndex) > 500) {
                        el.remove();
                    }
                });
                // Restore body state
                if (document.body) {
                    document.body.style.overflow = '';
                    document.body.style.pointerEvents = '';
                }
            } catch (e) { /* Ignore errors from shadow roots */ }
        };
        const throttledHeal = () => {
            const now = Date.now();
            if (now - lastScan > 1500) {
                lastScan = now;
                healPage();
                document.querySelectorAll('*').forEach(el => el.shadowRoot && healPage(el.shadowRoot));
            }
        };
        new MutationObserver(throttledHeal).observe(document.documentElement, { attributes: true, subtree: true });
        document.addEventListener('DOMContentLoaded', throttledHeal);
        
        // 6️⃣ Anti-debugger and eval traps
        const origEval = window.eval;
        const evalProxy = new Proxy(origEval, {
            apply(target, thisArg, args) {
                const script = args[0] || '';
                if (typeof script === 'string' && trapRegex.test(script)) {
                    log('Blocked eval trap');
                    return;
                }
                return Reflect.apply(target, thisArg, args);
            }
        });
        window.eval = evalProxy;
        spoofToString(evalProxy, 'eval');

        const origFunction = window.Function;
        const functionProxy = new Proxy(origFunction, {
            apply(target, thisArg, args) {
                if (args.some(arg => typeof arg === 'string' && /debugger/.test(arg))) {
                    return () => {}; // Return a dummy function
                }
                return Reflect.apply(target, thisArg, args);
            },
            construct(target, args) {
                if (args.some(arg => typeof arg === 'string' && /debugger/.test(arg))) {
                    return () => {}; // Return a dummy constructor
                }
                return new target(...args);
            }
        });
        window.Function = functionProxy;
        Object.defineProperty(Function.prototype, 'constructor', { get: () => functionProxy, configurable: true });
        spoofToString(functionProxy, 'Function');

        // 7️⃣ Nullify known global trap variables
        ['adblock', 'BlockAdBlock', 'FuckAdBlock', 'Bait', 'Trap', 'AdServer'].forEach(name => {
            try {
                Object.defineProperty(window, name, { get: () => undefined, configurable: true });
            } catch(e) {}
        });

        log('✅ Initialized successfully.');
    }
})();