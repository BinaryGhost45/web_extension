/**
 * ============================================================================
 * Project:      Audio FX & Reverb Tool (AuraFX)
 * Author:       BinaryGhost45
 * Version:      1.2.1
 * Description:  Lazy-loaded, shared-bus Web Audio DSP suite & floating HUD.
 * ============================================================================
 */

let isActivated = false;
let isPanelOpen = false;
let afxCtx = null;
let sharedBus = null;
let sharedImpulseBuffer = null;

// Track hooked elements without preventing garbage collection
const hookedElements = new WeakSet();
const activeSources = new Map(); // el -> MediaElementAudioSourceNode

const BASE_STATE = Object.freeze({
  gain: 1.0,
  speed: 1.0,
  pitch: 0,
  bass: 0,
  treble: 0,
  reverb: 0
});

const afxState = { ...BASE_STATE };

const AURAFX_PRESETS = Object.freeze({
  "default": { name: "Default (Flat)", gain: 1.0, speed: 1.0, pitch: 0, bass: 0, treble: 0, reverb: 0 },
  "studio": { name: "Studio", gain: 1.05, speed: 1.0, pitch: 0, bass: 2.0, treble: 3.5, reverb: 0.08 },
  "empty_hall": { name: "Empty Hall", gain: 1.0, speed: 1.0, pitch: 0, bass: 1.5, treble: -1.0, reverb: 0.62 },
  "slowed_reverb": { name: "Slowed + Reverb", gain: 1.1, speed: 0.85, pitch: -2, bass: 4.5, treble: -2.0, reverb: 0.45 },
  "sped_up": { name: "Sped Up", gain: 1.05, speed: 1.3, pitch: 2, bass: 2.5, treble: 3.0, reverb: 0.05 },
  "bass_boost": { name: "Bass Boost", gain: 1.0, speed: 1.0, pitch: 0, bass: 12.0, treble: 0.5, reverb: 0.04 },
  "vocal_clarity": { name: "Vocal Clarity", gain: 1.15, speed: 1.0, pitch: 0, bass: -3.0, treble: 6.0, reverb: 0.03 }
});

const STORAGE_KEYS = Object.freeze({
  PROFILES: 'aurafx_user_acoustic_profiles',
  THEME: 'aurafx_interface_theme'
});

// Use chrome.storage.sync so presets persist across shutdowns & Chrome profile
const storageArea = (typeof chrome !== 'undefined' && chrome.storage)
  ? (chrome.storage.sync || chrome.storage.local)
  : null;

async function getProfiles() {
  return new Promise((resolve) => {
    if (storageArea) {
      storageArea.get([STORAGE_KEYS.PROFILES], (res) => {
        resolve(res[STORAGE_KEYS.PROFILES] || {});
      });
    } else {
      try {
        const raw = localStorage.getItem(STORAGE_KEYS.PROFILES);
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    }
  });
}

async function saveProfile(name, params) {
  if (!name || typeof name !== 'string') return null;
  const list = await getProfiles();
  const key = `usr_${Date.now()}`;
  list[key] = {
    name: name.trim(),
    gain: Number(params.gain) || 1.0,
    speed: Number(params.speed) || 1.0,
    pitch: Number(params.pitch) || 0,
    bass: Number(params.bass) || 0,
    treble: Number(params.treble) || 0,
    reverb: Number(params.reverb) || 0
  };

  return new Promise((resolve) => {
    if (storageArea) {
      storageArea.set({ [STORAGE_KEYS.PROFILES]: list }, () => resolve(key));
    } else {
      try {
        localStorage.setItem(STORAGE_KEYS.PROFILES, JSON.stringify(list));
      } catch (e) {
        console.error('[AuraFX] Storage save failed:', e);
      }
      resolve(key);
    }
  });
}

async function delProfile(key) {
  if (!key) return;
  const list = await getProfiles();
  if (list[key]) {
    delete list[key];
    if (storageArea) {
      await storageArea.set({ [STORAGE_KEYS.PROFILES]: list });
    } else {
      try {
        localStorage.setItem(STORAGE_KEYS.PROFILES, JSON.stringify(list));
      } catch (e) {
        console.error('[AuraFX] Storage delete failed:', e);
      }
    }
  }
}

function getAuraFXSynthesizer(ctx) {
  if (sharedImpulseBuffer) return sharedImpulseBuffer;
  if (!ctx || typeof ctx.createBuffer !== 'function') return null;

  const rate = ctx.sampleRate || 44100;
  // 1.8s impulse tail reduces FFT memory footprint by ~30% while keeping lush decay
  const len = Math.max(1, Math.floor(rate * 1.8));
  const buf = ctx.createBuffer(2, len, rate);
  const chL = buf.getChannelData(0);
  const chR = buf.getChannelData(1);

  let lastL = 0;
  let lastR = 0;

  for (let i = 0; i < len; i++) {
    const env = Math.pow(1 - i / len, 2.5);
    const nL = (Math.random() * 2 - 1) * env;
    const nR = (Math.random() * 2 - 1) * env;

    lastL += 0.12 * (nL - lastL);
    lastR += 0.12 * (nR - lastR);

    chL[i] = lastL;
    chR[i] = lastR;
  }

  sharedImpulseBuffer = buf;
  return sharedImpulseBuffer;
}

/**
 * Single shared DSP bus per tab: eliminates creating multiple ConvolverNodes
 * on infinite-scroll feeds (X, Instagram, TikTok, YouTube Shorts).
 */
function getSharedBus() {
  if (sharedBus) return sharedBus;

  if (!afxCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    afxCtx = new Ctx();
  }

  const input = afxCtx.createGain();
  const bass = afxCtx.createBiquadFilter();
  bass.type = 'lowshelf';
  bass.frequency.value = 180;

  const treble = afxCtx.createBiquadFilter();
  treble.type = 'highshelf';
  treble.frequency.value = 3500;

  const gain = afxCtx.createGain();
  const conv = afxCtx.createConvolver();
  conv.buffer = getAuraFXSynthesizer(afxCtx);

  const dry = afxCtx.createGain();
  const wet = afxCtx.createGain();

  input.connect(bass);
  bass.connect(treble);
  treble.connect(gain);

  gain.connect(dry);
  gain.connect(conv);
  conv.connect(wet);

  dry.connect(afxCtx.destination);
  wet.connect(afxCtx.destination);

  sharedBus = { input, bass, treble, gain, dry, wet };
  return sharedBus;
}

function isAudioProcessingNeeded() {
  return (
    Math.abs(afxState.gain - 1.0) > 0.001 ||
    Math.abs(afxState.bass) > 0.01 ||
    Math.abs(afxState.treble) > 0.01 ||
    afxState.reverb > 0.001
  );
}

function cleanupDetachedMedia() {
  for (const [el, srcNode] of activeSources.entries()) {
    if (!document.contains(el)) {
      try {
        srcNode.disconnect();
      } catch {}
      activeSources.delete(el);
    }
  }
}

function hookMedia(el) {
  if (!isActivated) return null;
  if (!el || !(el instanceof HTMLMediaElement)) return null;
  if (!document.contains(el)) return null;

  // Avoid hijacking audio graph on X/Instagram until audio FX are actually dialed in,
  // preventing MSE stream stalls on muted/autoplay feed previews.
  if (!hookedElements.has(el) && !isAudioProcessingNeeded()) {
    return null;
  }

  if (hookedElements.has(el)) {
    return getSharedBus();
  }

  const bus = getSharedBus();
  if (!bus || !afxCtx) return null;

  try {
    const src = afxCtx.createMediaElementSource(el);
    src.connect(bus.input);
    hookedElements.add(el);
    activeSources.set(el, src);
    cleanupDetachedMedia();
    return bus;
  } catch {
    return null;
  }
}

let isInternalSpeedUpdate = false;

function setPlaybackRateSafe(el, rate) {
  isInternalSpeedUpdate = true;
  el.playbackRate = rate;
  setTimeout(() => {
    isInternalSpeedUpdate = false;
  }, 0);
}

function AuraFX_Modulations() {
  if (!isActivated) return;

  const bus = isAudioProcessingNeeded() ? getSharedBus() : sharedBus;
  if (bus) {
    bus.gain.gain.value = afxState.gain;
    bus.bass.gain.value = afxState.bass;
    bus.treble.gain.value = afxState.treble;
    bus.dry.gain.value = Math.cos(afxState.reverb * 0.5 * Math.PI);
    bus.wet.gain.value = Math.sin(afxState.reverb * 0.5 * Math.PI) * 0.8;
  }

  document.querySelectorAll('video, audio').forEach((el) => {
    try {
      const speedMultiplier = Number(afxState.speed) || 1.0;

      // Only alter pitch preservation when speed actually deviates from 1.0x
      // to avoid destabilizing X/Instagram MSE video decoders at 1.0x
      const isModifiedSpeed = Math.abs(speedMultiplier - 1.0) > 0.01;
      el.preservesPitch = !isModifiedSpeed;
      el.webkitPreservesPitch = !isModifiedSpeed;
      el.mozPreservesPitch = !isModifiedSpeed;

      const targetRate = Math.max(0.1, Math.min(16, speedMultiplier));
      if (Math.abs(el.playbackRate - targetRate) > 0.01) {
        setPlaybackRateSafe(el, targetRate);
      }

      // Only hook active/playing media or already-hooked media
      if (!el.paused || hookedElements.has(el)) {
        hookMedia(el);
      }
    } catch {
      // Ignore background or restricted element errors
    }
  });
}

async function activateAndToggleHUD() {
  if (!isActivated) {
    isActivated = true;
    await initHUD();
    startMediaListeners();
  }

  isPanelOpen = !isPanelOpen;

  if (afxCtx && afxCtx.state === 'suspended') {
    afxCtx.resume().catch(() => {});
  }

  const panel = document.getElementById('audio-fx-panel');
  if (panel) {
    panel.classList.toggle('hidden', !isPanelOpen);
  }
}

async function initHUD() {
  if (document.getElementById('audio-fx-panel')) return;

  const panel = document.createElement('div');
  panel.id = 'audio-fx-panel';
  panel.className = 'hidden';

  let theme = 'dark';
  try {
    theme = localStorage.getItem(STORAGE_KEYS.THEME) || 'dark';
  } catch {}

  if (theme === 'light') panel.classList.add('light-theme');

  panel.innerHTML = `
    <div class="fx-header">
      <span class="fx-title">AUDIO FX & REVERB</span>
      <div class="fx-header-actions">
        <button class="fx-btn" id="fx-btn-theme">${theme === 'light' ? '🌙 Dark' : '☀️ Light'}</button>
        <button class="fx-btn" id="fx-btn-reset">RESET</button>
      </div>
    </div>

    <div class="fx-preset-row">
      <select class="fx-dropdown" id="fx-dropdown-preset"></select>
      <input type="text" class="fx-name-input" id="fx-input-preset" placeholder="Preset name">
      <button class="fx-btn" id="fx-btn-save-preset">Save</button>
      <button class="fx-btn" id="fx-btn-del-preset" style="display:none;">Del</button>
    </div>

    <div class="fx-control-group">
      <div class="fx-label-row">
        <span>Volume</span>
        <input type="number" class="fx-num-input" id="fx-num-gain" min="0" max="3.5" step="0.05" value="1.0">
      </div>
      <input type="range" class="fx-slider" id="fx-range-gain" min="0" max="3.5" step="0.05" value="1">
    </div>

    <div class="fx-control-group">
      <div class="fx-label-row">
        <span>Speed</span>
        <input type="number" class="fx-num-input" id="fx-num-speed" min="0.25" max="4.0" step="0.05" value="1.0">
      </div>
      <input type="range" class="fx-slider" id="fx-range-speed" min="0.25" max="4.0" step="0.05" value="1.0">
    </div>

    <div class="fx-control-group">
      <div class="fx-label-row">
        <span>Pitch (st)</span>
        <input type="number" class="fx-num-input" id="fx-num-pitch" min="-12" max="12" step="0.5" value="0">
      </div>
      <input type="range" class="fx-slider" id="fx-range-pitch" min="-12" max="12" step="0.5" value="0">
    </div>

    <div class="fx-control-group">
      <div class="fx-label-row">
        <span>Bass Boost (dB)</span>
        <input type="number" class="fx-num-input" id="fx-num-bass" min="-10" max="22" step="0.5" value="0">
      </div>
      <input type="range" class="fx-slider" id="fx-range-bass" min="-10" max="22" step="0.5" value="0">
    </div>

    <div class="fx-control-group">
      <div class="fx-label-row">
        <span>Treble (dB)</span>
        <input type="number" class="fx-num-input" id="fx-num-treble" min="-15" max="15" step="0.5" value="0">
      </div>
      <input type="range" class="fx-slider" id="fx-range-treble" min="-15" max="15" step="0.5" value="0">
    </div>

    <div class="fx-control-group">
      <div class="fx-label-row">
        <span>Reverb (Wet %)</span>
        <input type="number" class="fx-num-input" id="fx-num-reverb" min="0" max="1" step="0.01" value="0">
      </div>
      <input type="range" class="fx-slider" id="fx-range-reverb" min="0" max="1" step="0.01" value="0">
    </div>

    <div class="fx-footer">
      <span>Press <strong>Alt + H</strong> to show / hide</span>
      <div class="fx-backup-actions">
        <button class="fx-btn" id="fx-btn-export" title="Download presets backup">Export</button>
        <button class="fx-btn" id="fx-btn-import" title="Load presets backup">Import</button>
        <input type="file" id="fx-file-import" accept=".json" style="display:none;">
      </div>
    </div>
  `;

  document.body.appendChild(panel);

  ['click', 'mousedown', 'keydown'].forEach((evt) => {
    panel.addEventListener(evt, (e) => e.stopPropagation());
  });

  const btnTheme = panel.querySelector('#fx-btn-theme');
  const btnReset = panel.querySelector('#fx-btn-reset');
  const selPreset = panel.querySelector('#fx-dropdown-preset');
  const inputPreset = panel.querySelector('#fx-input-preset');
  const btnSave = panel.querySelector('#fx-btn-save-preset');
  const btnDel = panel.querySelector('#fx-btn-del-preset');
  const btnExport = panel.querySelector('#fx-btn-export');
  const btnImport = panel.querySelector('#fx-btn-import');
  const fileImport = panel.querySelector('#fx-file-import');

  const inGain = panel.querySelector('#fx-range-gain');
  const numGain = panel.querySelector('#fx-num-gain');
  const inSpeed = panel.querySelector('#fx-range-speed');
  const numSpeed = panel.querySelector('#fx-num-speed');
  const inPitch = panel.querySelector('#fx-range-pitch');
  const numPitch = panel.querySelector('#fx-num-pitch');
  const inBass = panel.querySelector('#fx-range-bass');
  const numBass = panel.querySelector('#fx-num-bass');
  const inTreble = panel.querySelector('#fx-range-treble');
  const numTreble = panel.querySelector('#fx-num-treble');
  const inReverb = panel.querySelector('#fx-range-reverb');
  const numReverb = panel.querySelector('#fx-num-reverb');

  async function renderPresets(activeKey = "default") {
    selPreset.innerHTML = '';

    const grpBuiltin = document.createElement('optgroup');
    grpBuiltin.label = 'Built-in Presets';
    Object.keys(AURAFX_PRESETS).forEach((k) => {
      const opt = document.createElement('option');
      opt.value = k;
      opt.textContent = AURAFX_PRESETS[k].name;
      grpBuiltin.appendChild(opt);
    });
    selPreset.appendChild(grpBuiltin);

    const userList = await getProfiles();
    const userKeys = Object.keys(userList);
    if (userKeys.length > 0) {
      const grpCustom = document.createElement('optgroup');
      grpCustom.label = 'Custom Presets';
      userKeys.forEach((k) => {
        const opt = document.createElement('option');
        opt.value = k;
        opt.textContent = userList[k].name;
        grpCustom.appendChild(opt);
      });
      selPreset.appendChild(grpCustom);
    }

    selPreset.value = activeKey;
    btnDel.style.display = activeKey.startsWith('usr_') ? 'inline-block' : 'none';
  }

  function applyFX() {
    if (afxCtx && afxCtx.state === 'suspended') {
      afxCtx.resume().catch(() => {});
    }
    AuraFX_Modulations();
  }

  function updateHUD() {
    inGain.value = afxState.gain;
    numGain.value = afxState.gain.toFixed(2);

    inSpeed.value = afxState.speed;
    numSpeed.value = afxState.speed.toFixed(2);

    inPitch.value = afxState.pitch;
    numPitch.value = afxState.pitch.toFixed(1);

    inBass.value = afxState.bass;
    numBass.value = afxState.bass.toFixed(1);

    inTreble.value = afxState.treble;
    numTreble.value = afxState.treble.toFixed(1);

    inReverb.value = afxState.reverb;
    numReverb.value = afxState.reverb.toFixed(2);
  }

  function syncSpeedWithPitch(newSpeed) {
    afxState.speed = Math.max(0.25, Math.min(4.0, newSpeed));
    afxState.pitch = parseFloat((12 * Math.log2(afxState.speed)).toFixed(1));

    inSpeed.value = afxState.speed;
    numSpeed.value = afxState.speed.toFixed(2);
    inPitch.value = afxState.pitch;
    numPitch.value = afxState.pitch.toFixed(1);

    applyFX();
  }

  function syncPitchWithSpeed(newPitch) {
    afxState.pitch = Math.max(-12, Math.min(12, newPitch));
    afxState.speed = parseFloat(Math.pow(2, afxState.pitch / 12).toFixed(2));

    inPitch.value = afxState.pitch;
    numPitch.value = afxState.pitch.toFixed(1);
    inSpeed.value = afxState.speed;
    numSpeed.value = afxState.speed.toFixed(2);

    applyFX();
  }

  function loadProfile(p) {
    if (!p) return;
    afxState.gain = Number(p.gain) ?? 1.0;
    afxState.speed = Number(p.speed) ?? 1.0;
    afxState.pitch = parseFloat((12 * Math.log2(afxState.speed)).toFixed(1));
    afxState.bass = Number(p.bass) ?? 0;
    afxState.treble = Number(p.treble) ?? 0;
    afxState.reverb = Number(p.reverb) ?? 0;
    updateHUD();
    applyFX();
  }

  function bindDualControl(rangeEl, numEl, key) {
    rangeEl.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      afxState[key] = val;
      numEl.value = val;
      applyFX();
    });

    numEl.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      if (!isNaN(val)) {
        afxState[key] = val;
        rangeEl.value = val;
        applyFX();
      }
    });
  }

  bindDualControl(inGain, numGain, 'gain');
  bindDualControl(inBass, numBass, 'bass');
  bindDualControl(inTreble, numTreble, 'treble');
  bindDualControl(inReverb, numReverb, 'reverb');

  inSpeed.addEventListener('input', (e) => syncSpeedWithPitch(parseFloat(e.target.value)));
  numSpeed.addEventListener('input', (e) => {
    const v = parseFloat(e.target.value);
    if (!isNaN(v)) syncSpeedWithPitch(v);
  });

  inPitch.addEventListener('input', (e) => syncPitchWithSpeed(parseFloat(e.target.value)));
  numPitch.addEventListener('input', (e) => {
    const v = parseFloat(e.target.value);
    if (!isNaN(v)) syncPitchWithSpeed(v);
  });

  btnTheme.addEventListener('click', () => {
    panel.classList.toggle('light-theme');
    const isLight = panel.classList.contains('light-theme');
    btnTheme.textContent = isLight ? '🌙 Dark' : '☀️ Light';
    try {
      localStorage.setItem(STORAGE_KEYS.THEME, isLight ? 'light' : 'dark');
    } catch {}
  });

  selPreset.addEventListener('change', async (e) => {
    const k = e.target.value;
    btnDel.style.display = k.startsWith('usr_') ? 'inline-block' : 'none';
    if (AURAFX_PRESETS[k]) {
      loadProfile(AURAFX_PRESETS[k]);
    } else {
      const list = await getProfiles();
      if (list[k]) loadProfile(list[k]);
    }
  });

  btnSave.addEventListener('click', async () => {
    const name = inputPreset.value.trim();
    if (!name) return;
    const k = await saveProfile(name, { ...afxState });
    if (k) {
      inputPreset.value = '';
      await renderPresets(k);
    }
  });

  btnDel.addEventListener('click', async () => {
    const k = selPreset.value;
    if (k.startsWith('usr_')) {
      await delProfile(k);
      await renderPresets("default");
      loadProfile(AURAFX_PRESETS["default"]);
    }
  });

  btnReset.addEventListener('click', () => {
    loadProfile(BASE_STATE);
    renderPresets("default");
  });

  // Export presets to a standard JSON file in Downloads/chosen folder
  btnExport.addEventListener('click', async () => {
    const profiles = await getProfiles();
    const blob = new Blob([JSON.stringify(profiles, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'AuraFX_Presets.json';
    a.click();
    URL.revokeObjectURL(url);
  });

  btnImport.addEventListener('click', () => fileImport.click());
  fileImport.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const imported = JSON.parse(await file.text());
      const current = await getProfiles();
      const merged = { ...current, ...imported };
      if (storageArea) {
        await storageArea.set({ [STORAGE_KEYS.PROFILES]: merged });
      } else {
        localStorage.setItem(STORAGE_KEYS.PROFILES, JSON.stringify(merged));
      }
      await renderPresets("default");
    } catch (err) {
      console.error('[AuraFX] Invalid preset file:', err);
    }
    fileImport.value = '';
  });

  await renderPresets("default");
}

let listenersStarted = false;
function startMediaListeners() {
  if (listenersStarted) return;
  listenersStarted = true;

  // Hook media only when it actively plays (prevents feed thumbnail/preview bloat)
  document.addEventListener('play', (e) => {
    if (e.target instanceof HTMLMediaElement) {
      hookMedia(e.target);
      AuraFX_Modulations();
    }
  }, true);

  // Release detached video sources when X/Instagram unloads recycled feed cards
  document.addEventListener('emptied', (e) => {
    if (e.target instanceof HTMLMediaElement && activeSources.has(e.target)) {
      try {
        activeSources.get(e.target).disconnect();
      } catch {}
      activeSources.delete(e.target);
    }
  }, true);

  // Bi-directional speed sync with native player controls
  document.addEventListener('ratechange', (e) => {
    if (!(e.target instanceof HTMLMediaElement)) return;
    if (isInternalSpeedUpdate) return;

    const siteSpeed = parseFloat(e.target.playbackRate.toFixed(2));
    if (Math.abs(afxState.speed - siteSpeed) > 0.01) {
      afxState.speed = siteSpeed;
      afxState.pitch = parseFloat((12 * Math.log2(siteSpeed)).toFixed(1));

      const inSpeed = document.querySelector('#fx-range-speed');
      const numSpeed = document.querySelector('#fx-num-speed');
      const inPitch = document.querySelector('#fx-range-pitch');
      const numPitch = document.querySelector('#fx-num-pitch');

      if (inSpeed && numSpeed) {
        inSpeed.value = siteSpeed;
        numSpeed.value = siteSpeed.toFixed(2);
      }
      if (inPitch && numPitch) {
        inPitch.value = afxState.pitch;
        numPitch.value = afxState.pitch.toFixed(1);
      }
    }
  }, true);
}

// Dormant until first Alt + H press
window.addEventListener('keydown', (e) => {
  if (e.altKey && (e.key === 'h' || e.key === 'H')) {
    e.preventDefault();
    e.stopImmediatePropagation();
    activateAndToggleHUD();
  }
}, true);

// Dormant until first toolbar icon click
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((req) => {
    if (req.action === "TOGGLE_AURA_FX") {
      activateAndToggleHUD();
    }
  });
}