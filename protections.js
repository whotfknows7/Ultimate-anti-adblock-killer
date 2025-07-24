(async function() { // Make sure the main function is async
            'use strict';
            
            // --- Whitelist Check ---
            const { whitelist = [] } = await chrome.storage.sync.get('whitelist');
            if (whitelist.some(d => window.location.hostname.endsWith(d))) {
                return; // Exit if domain is whitelisted
            }

    const log = (...args) => console.debug('[Privacy Protections]', ...args);

    // Helper to safely define a property on an object
    const safeDefineProperty = (obj, prop, descriptor) => {
        try {
            Object.defineProperty(obj, prop, { ...descriptor, configurable: true });
        } catch (e) {
            log(`Failed to define property '${prop}':`, e.message);
        }
    };

    // --- MAPPING OF PROTECTIONS TO MODES ---
    // Defines which protections are active in each predefined mode.
    const modeProtections = {
        light: {
            clientRectsSpoofing: true,
            hidePlugins: true,
            nullifyOpener: true,
        },
        standard: {
            clientRectsSpoofing: true,
            hidePlugins: true,
            nullifyOpener: true,
            canvasSpoofing: true,
            webglSpoofing: true,
            batterySpoofing: true,
        },
        heavy: {
            clientRectsSpoofing: true,
            hidePlugins: true,
            nullifyOpener: true,
            canvasSpoofing: true,
            webglSpoofing: true,
            batterySpoofing: true,
            audioSpoofing: true,
            hardwareSpoofing: true,
            webRTCProtection: true,
        },
        extreme: {
            clientRectsSpoofing: true,
            hidePlugins: true,
            nullifyOpener: true,
            canvasSpoofing: true,
            webglSpoofing: true,
            batterySpoofing: true,
            audioSpoofing: true,
            hardwareSpoofing: true,
            webRTCProtection: true,
        }
    };

    // ===================================================================
    // =================== PROTECTION IMPLEMENTATIONS ====================
    // ===================================================================

    // 1. Canvas Fingerprint Spoofing
    function applyCanvasSpoofing() {
        const originalGetImageData = CanvasRenderingContext2D.prototype.getImageData;
        const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;

        const addNoise = (ctx, w, h) => {
            const imageData = originalGetImageData.call(ctx, 0, 0, w, h);
            for (let i = 0; i < imageData.data.length; i += 4) {
                const noise = Math.random() * 8 | 0;
                imageData.data[i] ^= noise;
                imageData.data[i + 1] ^= noise;
                imageData.data[i + 2] ^= noise;
            }
            ctx.putImageData(imageData, 0, 0);
        };

        safeDefineProperty(HTMLCanvasElement.prototype, 'toDataURL', {
            value: function(...args) {
                const ctx = this.getContext('2d');
                if (ctx) addNoise(ctx, this.width, this.height);
                return originalToDataURL.apply(this, args);
            }
        });

        safeDefineProperty(CanvasRenderingContext2D.prototype, 'getImageData', {
            value: function(...args) {
                const imageData = originalGetImageData.apply(this, args);
                for (let i = 0; i < imageData.data.length; i += 4) {
                    const noise = Math.random() * 4 | 0;
                    imageData.data[i] ^= noise;
                    imageData.data[i + 1] ^= noise;
                    imageData.data[i + 2] ^= noise;
                }
                return imageData;
            }
        });
        log('Canvas spoofing enabled.');
    }

    // 2. WebGL Fingerprint Spoofing
    function applyWebGLSpoofing() {
        if (!window.WebGLRenderingContext) return;
        const proto = WebGLRenderingContext.prototype;
        const origGetParameter = proto.getParameter;
        safeDefineProperty(proto, 'getParameter', {
            value: function(param) {
                if (param === 37445) return 'Google Inc.'; // UNMASKED_VENDOR_WEBGL
                if (param === 37446) return 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 15.0.0)), SwiftShader driver)'; // UNMASKED_RENDERER_WEBGL
                return origGetParameter.call(this, param);
            }
        });
        log('WebGL spoofing enabled.');
    }

    // 3. Audio Context Fingerprint Spoofing
    function applyAudioSpoofing() {
        const origGetFloatData = AnalyserNode.prototype.getFloatFrequencyData;
        safeDefineProperty(AnalyserNode.prototype, 'getFloatFrequencyData', {
            value: function(array) {
                origGetFloatData.call(this, array);
                for (let i = 0; i < array.length; i++) {
                    array[i] += (Math.random() - 0.5) * 0.1;
                }
            }
        });

        const origCopyFromChannel = AudioBuffer.prototype.copyFromChannel;
        safeDefineProperty(AudioBuffer.prototype, 'copyFromChannel', {
            value: function(destination, channelNumber, startInChannel) {
                origCopyFromChannel.call(this, destination, channelNumber, startInChannel);
                for (let i = 0; i < destination.length; i++) {
                    destination[i] += (Math.random() - 0.5) * 0.005;
                }
            }
        });
        log('Audio spoofing enabled.');
    }

    // 4. DOM Rectangles Spoofing
    function applyClientRectsSpoofing() {
        const spoofedRect = { x: 0, y: 0, width: 100, height: 100, top: 0, left: 0, right: 100, bottom: 100, toJSON: () => "{}" };
        const spoofedList = { length: 1, 0: spoofedRect, item: () => spoofedRect };

        ['getBoundingClientRect', 'getClientRects'].forEach(name => {
            const isList = name === 'getClientRects';
            safeDefineProperty(Element.prototype, name, { value: () => isList ? spoofedList : spoofedRect });
            safeDefineProperty(Range.prototype, name, { value: () => isList ? spoofedList : spoofedRect });
        });
        log('Client rects spoofing enabled.');
    }

    // 5. WebRTC Protection
    function applyWebRTCProtection() {
        // Disable common WebRTC APIs
        safeDefineProperty(window, 'RTCPeerConnection', { value: undefined });
        safeDefineProperty(window, 'webkitRTCPeerConnection', { value: undefined });
        safeDefineProperty(window, 'RTCDataChannel', { value: undefined });

        // Block device enumeration
        if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
            safeDefineProperty(navigator.mediaDevices, 'enumerateDevices', { value: () => Promise.resolve([]) });
        }

        // Mask local IP in ICE candidates if API somehow still exists
        if (window.RTCIceCandidate) {
            const origIce = window.RTCIceCandidate;
            safeDefineProperty(window, 'RTCIceCandidate', {
                value: function(init) {
                    if (init && init.candidate) {
                        init.candidate = init.candidate.replace(/(\d{1,3}\.){3}\d{1,3}/g, '0.0.0.0');
                    }
                    return new origIce(init);
                }
            });
            window.RTCIceCandidate.prototype = origIce.prototype;
        }
        log('WebRTC protection enabled.');
    }
    
    // 6. Hardware & API Spoofing (CPU, RAM, VR, Gamepad)
    // In protections.js
    function applyHardwareSpoofing() {
        safeDefineProperty(navigator, 'hardwareConcurrency', { get: () => 4 });
        safeDefineProperty(navigator, 'deviceMemory', { get: () => 8 }); // Changed to 8GB for variety
        safeDefineProperty(navigator, 'getVRDisplays', { value: undefined });
        safeDefineProperty(navigator, 'getGamepads', { value: () => [] });
        log('Hardware (CPU/RAM/VR/Gamepad) spoofing enabled.');
    }
    function applyHardwareSpoofing() {
        safeDefineProperty(navigator, 'hardwareConcurrency', { get: () => 4 });
        safeDefineProperty(navigator, 'deviceMemory', { get: () => 4 });
        safeDefineProperty(navigator, 'getVRDisplays', { value: undefined });
        safeDefineProperty(navigator, 'getGamepads', { value: () => [] });
        log('Hardware spoofing enabled.');
    }

    // 7. Battery API Spoofing
    function applyBatterySpoofing() {
        if (navigator.getBattery) {
            const spoofedBattery = {
                charging: true,
                chargingTime: 0,
                dischargingTime: Infinity,
                level: 1.0,
                onchargingchange: null,
                onlevelchange: null,
            };
            safeDefineProperty(navigator, 'getBattery', { value: () => Promise.resolve(spoofedBattery) });
        }
        log('Battery API spoofing enabled.');
    }

    // 8. Plugin & MimeType Hiding
    function hidePluginsAndMimetypes() {
        safeDefineProperty(navigator, 'plugins', { get: () => ({ length: 0 }) });
        safeDefineProperty(navigator, 'mimeTypes', { get: () => ({ length: 0 }) });
        log('Plugins and MimeTypes hidden.');
    }
    
    // 9. Nullify window.opener
    function nullifyWindowOpener() {
        safeDefineProperty(window, 'opener', { get: () => null });
        log('window.opener nullified.');
    }


    // --- MAIN EXECUTION LOGIC ---
    chrome.storage.sync.get('config', ({ config }) => {
        if (!config) {
            log('Config not found. Using default standard protections.');
            config = { mode: 'standard' };
        }

        const activeSettings = config.mode === 'custom' ? config.custom : modeProtections[config.mode];

        if (!activeSettings) {
            log(`Invalid mode "${config.mode}" selected. No protections applied.`);
            return;
        }

        log(`Initializing protections for mode: ${config.mode}`);

        // Conditionally apply each protection based on the active settings
        if (activeSettings.clientRectsSpoofing) applyClientRectsSpoofing();
        if (activeSettings.hidePlugins) hidePluginsAndMimetypes();
        if (activeSettings.nullifyOpener) nullifyWindowOpener();
        if (activeSettings.canvasSpoofing) applyCanvasSpoofing();
        if (activeSettings.webglSpoofing) applyWebGLSpoofing();
        if (activeSettings.batterySpoofing) applyBatterySpoofing();
        if (activeSettings.audioSpoofing) applyAudioSpoofing();
        if (activeSettings.hardwareSpoofing) applyHardwareSpoofing();
        if (activeSettings.webRTCProtection) applyWebRTCProtection();
    });

})();