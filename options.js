document.addEventListener('DOMContentLoaded', () => {
    const customSettingsContainer = document.getElementById('custom-settings');
    const status = document.getElementById('status');
    const whitelistTextarea = document.getElementById('whitelist');
    const saveWhitelistBtn = document.getElementById('save-whitelist');  
    const customSettings = {
        'Canvas Spoofing': 'canvasSpoofing',
        'WebGL Spoofing': 'webglSpoofing',
        'Audio Spoofing': 'audioSpoofing',
        'Client Rects Spoofing': 'clientRectsSpoofing',
        'WebRTC Protection': 'webRTCProtection',
        'Hardware Spoofing': 'hardwareSpoofing',
        'Battery API Spoofing': 'batterySpoofing',
        'User-Agent Spoofing': 'userAgentSpoofing',
        'Anti-Adblock Killer': 'antiAdblockKiller',
        'Countdown Killer': 'countdownKiller'
    };

    // Populate custom settings toggles
    for (const [label, key] of Object.entries(customSettings)) {
        customSettingsContainer.innerHTML += `
            <div class="setting-toggle">
                <label for="${key}">${label}</label>
                <input type="checkbox" id="${key}" data-key="${key}">
            </div>`;
    }

    // Load and apply current settings
    function loadSettings() {
        chrome.storage.sync.get('config', ({ config }) => {
            if (!config) return;
            document.querySelector(`input[name="mode"][value="${config.mode}"]`).checked = true;
            
            const isCustom = config.mode === 'custom';
            customSettingsContainer.style.display = isCustom ? 'grid' : 'none';

            for (const key of Object.values(customSettings)) {
                const checkbox = document.getElementById(key);
                if(checkbox) checkbox.checked = !!config.custom[key];
            }
            chrome.storage.sync.get('whitelist', ({ whitelist }) => {
            if (whitelist && Array.isArray(whitelist)) {
                whitelistTextarea.value = whitelist.join('\n');
            }
        });
    }
)
    // Save settings
    function saveSettings() {
        const mode = document.querySelector('input[name="mode"]:checked').value;
        chrome.storage.sync.get('config', ({ config }) => {
            config.mode = mode;
            if (mode === 'custom') {
                for (const key of Object.values(customSettings)) {
                    const checkbox = document.getElementById(key);
                    if(checkbox) config.custom[key] = checkbox.checked;
                }
            }
            chrome.storage.sync.set({ config }, () => {
                status.textContent = 'Settings saved!';
                setTimeout(() => status.textContent = '', 2000);
                loadSettings(); // Refresh UI
            }
            );
            function saveWhitelist() {
                const domains = whitelistTextarea.value.split('\n')
                    .map(d => d.trim())
                    .filter(d => d.length > 0 && d.includes('.'));
        
                chrome.storage.sync.set({ whitelist: domains }, () => {
                    status.textContent = 'Whitelist saved!';
                    setTimeout(() => status.textContent = '', 2000);
        });
    }
        });
    }

    // Add event listeners
    document.querySelectorAll('input[name="mode"]').forEach(radio => radio.addEventListener('change', saveModeAndCustom));
    customSettingsContainer.addEventListener('change', e => { if (e.target.type === 'checkbox') saveModeAndCustom(); });
    saveWhitelistBtn.addEventListener('click', saveWhitelist);

    loadSettings();
    }
});