// --- Global State Variables ---
let currentConfig = {};
let currentWhitelist = [];

// Default settings for each mode
// In background.js, replace your modeConfigs with this:
const modeConfigs = {
    light: {
        removeGoogleHeaders: true,
        etagProtection: true,
        refererControl: { thirdParty: { allow: true, fullURL: false } } // Strip 3rd party
    },
    standard: {
        removeGoogleHeaders: true,
        etagProtection: true,
        cookieControl: { thirdParty: 'removeAll' },
        proxySpoofing: { useXForwardedFor: true, useVia: true },
        refererControl: { sameDomain: { fullURL: false }, thirdParty: { allow: false } } // Strip same-domain, block 3rd party
    },
    heavy: {
        removeGoogleHeaders: true,
        etagProtection: true,
        cookieControl: { firstParty: 'removeAll', thirdParty: 'removeAll' },
        proxySpoofing: { useXForwardedFor: true, useVia: true, useClientIP: true },
        refererControl: { sameHostname: { fullURL: false }, sameDomain: { fullURL: false }, thirdParty: { allow: false } } // Strip same-host/domain, block 3rd party
    },
    extreme: {
        removeGoogleHeaders: true,
        etagProtection: true,
        cookieControl: { firstParty: 'removeAll', thirdParty: 'removeAll' },
        proxySpoofing: { useXForwardedFor: true, useVia: true, useClientIP: true },
        refererControl: { allow: false } // Block all referers
    }
};

// --- Helper Functions ---
const stripHeaders = (headers, names) => headers.filter(h => !names.some(name => h.name.toLowerCase() === name));
const domainOf = url => { try { return new URL(url).hostname; } catch (e) { return ''; } };
let spoofIP = Array(4).fill(0).map(() => Math.floor(Math.random() * 256)).join('.');
setInterval(() => { spoofIP = Array(4).fill(0).map(() => Math.floor(Math.random() * 256)).join('.'); }, 60 * 1000);

// --- State Management ---
async function updateLocalState() {
  const data = await chrome.storage.sync.get(['config', 'whitelist']);
  currentConfig = data.config || { mode: 'standard' };
  currentWhitelist = data.whitelist || [];
  console.log('[Background] Settings updated:', { config: currentConfig, whitelist: currentWhitelist });
}

// Update state when storage changes (e.g., from options page)
chrome.storage.onChanged.addListener(updateLocalState);

// --- Icon Management ---
function updateTabIcon(tabId, url) {
  if (!url || !url.startsWith('http')) {
    chrome.action.setIcon({ path: "icons/icon128_disabled.png", tabId: tabId });
    chrome.action.setTitle({ title: "Inactive on this page", tabId: tabId });
    return;
  }
  const currentHost = domainOf(url);
  const isWhitelisted = currentWhitelist.some(whitelistedDomain => currentHost.endsWith(whitelistedDomain));
  chrome.action.setIcon({ path: isWhitelisted ? "icons/icon128_disabled.png" : "icons/icon128.png", tabId: tabId });
  chrome.action.setTitle({ title: isWhitelisted ? `Disabled on ${currentHost}` : "Privacy Protection Active", tabId: tabId });
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'loading') updateTabIcon(tabId, tab.url);
});
chrome.tabs.onActivated.addListener(activeInfo => {
  chrome.tabs.get(activeInfo.tabId, (tab) => updateTabIcon(tab.id, tab.url));
});

// --- Synchronous Web Request Listeners ---
// In background.js, inside the onBeforeSendHeaders function:

function onBeforeSendHeaders(details) {
  const host = domainOf(details.url);
  if (currentWhitelist.some(d => host.endsWith(d))) return { requestHeaders: details.requestHeaders };
  
  let h = details.requestHeaders || [];
  const settings = currentConfig.mode === 'custom' ? currentConfig.custom.network || {} : modeConfigs[currentConfig.mode] || {};
  
  if (settings.removeGoogleHeaders) h = stripHeaders(h, ['x-client-data', 'x-chrome-uma-enabled']);
  if (settings.proxySpoofing) {
    if (settings.proxySpoofing.useXForwardedFor) h.push({ name: 'X-Forwarded-For', value: spoofIP });
    if (settings.proxySpoofing.useVia) h.push({ name: 'Via', value: `1.1 ${spoofIP}` });
    if (settings.proxySpoofing.useClientIP) h.push({ name: 'Client-IP', value: spoofIP });
  }
  
  // ======================= START OF NEW CODE =======================
  if (settings.refererControl) {
    const refererHeader = h.find(x => x.name.toLowerCase() === 'referer');
    
    if (refererHeader) {
      const refHost = domainOf(refererHeader.value);
      let policy = { allow: true, fullURL: true }; // Default: do nothing
      
      // Determine which policy to apply
      if (settings.refererControl.allow === false) { // Global block
        policy = { allow: false };
      } else if (host === refHost) {
        policy = settings.refererControl.sameHostname || policy;
      } else if (refHost && (host.endsWith('.' + refHost) || refHost.endsWith('.' + host))) {
        policy = settings.refererControl.sameDomain || policy;
      } else if (refHost) {
        policy = settings.refererControl.thirdParty || policy;
      }
      
      // Apply the policy
      if (policy.allow === false) {
        // Block the Referer entirely
        h = stripHeaders(h, ['referer']);
      } else if (policy.fullURL === false) {
        // Strip the Referer to its origin
        const origin = new URL(refererHeader.value).origin;
        h = stripHeaders(h, ['referer']);
        h.push({ name: 'Referer', value: origin });
      }
      // If policy.allow is true and policy.fullURL is not false, we do nothing and keep the original header.
    }
  }
  // ======================== END OF NEW CODE ========================
  
  return { requestHeaders: h };
}

function onHeadersReceived(details) {
  const host = domainOf(details.url);
  if (currentWhitelist.some(d => host.endsWith(d))) return { responseHeaders: details.responseHeaders };
  
  let h = details.responseHeaders || [];
  const settings = currentConfig.mode === 'custom' ? currentConfig.custom : modeConfigs[currentConfig.mode] || {};
  
  if (settings.etagProtection) h = stripHeaders(h, ['etag']);
  if (settings.cookieControl) {
    const isThirdParty = details.initiator && domainOf(details.url) !== domainOf(details.initiator);
    if ((isThirdParty && settings.cookieControl.thirdParty === 'removeAll') || (!isThirdParty && settings.cookieControl.firstParty === 'removeAll')) {
      h = stripHeaders(h, ['set-cookie']);
    }
  }
  
  return { responseHeaders: h };
}

// Register listeners
chrome.webRequest.onBeforeSendHeaders.addListener(onBeforeSendHeaders, { urls: ['<all_urls>'] }, ['blocking', 'requestHeaders', 'extraHeaders']);
chrome.webRequest.onHeadersReceived.addListener(onHeadersReceived, { urls: ['<all_urls>'] }, ['blocking', 'responseHeaders', 'extraHeaders']);

// --- Initial Run ---
updateLocalState(); // Load settings when the service worker starts