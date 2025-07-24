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
            (mode === 'custom' && config.custom.countdownKiller)
        );
        
        if (!isEnabled) {
            return; // Do not execute any of the logic below
        }
        
        // If enabled, proceed with initialization.
        initialize();
    });
    
    function initialize() {
        const log = (...args) => console.debug('[Countdown Killer]', ...args);
        
        // Expanded regex to catch more variations of buttons/links
        const clickableRegex = /(continue|proceed|get link|skip|download|next|go to|visit|start|show|click here|×|✕)/i;
        
        // Regex to find elements that look like countdown timers
        const timerRegex = /(wait|please wait).*\s(\d{1,3})\s(seconds?|s)/i;
        
        const seenElements = new WeakSet(); // Keep track of elements we've already processed
        
        /**
         * Processes a single DOM node to see if it's a timer or a clickable element.
         * @param {Node} node The DOM node to process.
         */
        function processNode(node) {
            // Ensure we only process Element nodes and haven't seen them before
            if (node.nodeType !== Node.ELEMENT_NODE || seenElements.has(node)) {
                return;
            }
            
            const text = (node.textContent || "").trim();
            
            // --- 1. Handle Countdown Timers ---
            if (timerRegex.test(text)) {
                log('Found potential timer:', node);
                node.textContent = node.textContent.replace(timerRegex, "0 seconds");
                seenElements.add(node);
            }
            
            // --- 2. Handle Clickable Elements (Buttons/Links) ---
            const isClickable = node.matches('a[href], button, [role="button"]');
            if (!isClickable) return;
            
            const ariaLabel = node.getAttribute('aria-label') || '';
            const title = node.getAttribute('title') || '';
            const combinedText = `${text} ${ariaLabel} ${title}`;
            
            if (clickableRegex.test(combinedText)) {
                log('Found clickable target:', node);
                
                // Make the element visible and enabled
                if (node.style.display === 'none') node.style.display = 'inline-block';
                if (node.style.visibility === 'hidden') node.style.visibility = 'visible';
                if (node.hasAttribute('disabled')) node.removeAttribute('disabled');
                
                // Only click if it's visible on the page to avoid errors
                if (node.offsetParent !== null) {
                    log('Auto-clicking:', node);
                    node.click();
                    seenElements.add(node);
                }
            }
        }
        
        /**
         * Scans a given document (main or iframe) for initial timers and buttons.
         * @param {Document} doc The document to scan.
         */
        function initialScan(doc) {
            if (!doc) return;
            log(`Running initial scan on ${doc.location.href}`);
            doc.querySelectorAll('span, div, p, a, button, [role="button"]').forEach(processNode);
        }
        
        // --- Main Execution ---
        
        // Run the initial scan once the DOM is ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => initialScan(document));
        } else {
            initialScan(document);
        }
        
        // Create a MutationObserver to watch for dynamically added elements
        const observer = new MutationObserver(mutations => {
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    // Process the new node itself
                    processNode(node);
                    
                    // If the new node contains other elements, process them too
                    if (node.querySelectorAll) {
                        node.querySelectorAll('span, div, p, a, button, [role="button"]').forEach(processNode);
                    }
                    
                    // If a new iframe is added, scan it once it loads
                    if (node.tagName === 'IFRAME') {
                        node.addEventListener('load', () => {
                            try {
                                initialScan(node.contentDocument);
                            } catch (e) {
                                log('Could not access cross-origin iframe for scanning.');
                            }
                        });
                    }
                }
            }
        });
        
        // Start observing the entire document for changes
        observer.observe(document.documentElement, {
            childList: true,
            subtree: true
        });
        
        log('✅ Initialized and observing for countdowns.');
    }
})();