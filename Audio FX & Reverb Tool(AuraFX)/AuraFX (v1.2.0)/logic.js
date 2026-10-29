/**
 * ============================================================================
 * Project:      Audio FX & Reverb Tool (AuraFX)
 * Author:       BinaryGhost45
 * Description:  A real-time, in-browser Digital Signal Processing (DSP) suite
 *               and floating HUD for HTML5 media elements.
 * ============================================================================
 */

let isPanelOpen = false;
let afxCtx = null;
let sharedImpulseBuffer = null;
const mediaMap = new WeakMap();

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

async function getProfiles() {
  return new Promise((resolve) => {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get([STORAGE_KEYS.PROFILES], (res) => {
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
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ [STORAGE_KEYS.PROFILES]: list }, () => resolve(key));
    } else {
      try {
        localStorage.setItem(STORAGE_KEYS.PROFILES, JSON.stringify(list));
      } catch (e) {
        console.error('[AuraFX] LocalStorage save failed:', e);
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
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      await chrome.storage.local.set({ [STORAGE_KEYS.PROFILES]: list });
    } else {
      try {
        localStorage.setItem(STORAGE_KEYS.PROFILES, JSON.stringify(list));
      } catch (e) {
        console.error('[AuraFX] LocalStorage delete failed:', e);
      }
    }
  }
}

function getAuraFXSynthesizer(ctx) {
  if (sharedImpulseBuffer) return sharedImpulseBuffer;
  if (!ctx || typeof ctx.createBuffer !== 'function') return null;

  const rate = ctx.sampleRate || 44100;
  const len = Math.max(1, Math.floor(rate * 2.5));
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

function getCtx() {
  if (!afxCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    afxCtx = new Ctx();
  }
  return afxCtx;
}

function hookMedia(el) {
  if (!el || !(el instanceof HTMLMediaElement)) return null;
  if (!document.contains(el)) return null;
  if (mediaMap.has(el)) return mediaMap.get(el);

  const ctx = getCtx();
  if (!ctx) return null;

  let src;
  try {
    src = ctx.createMediaElementSource(el);
  } catch (err) {
    return null;
  }

  try {
    const gain = ctx.createGain();
    const bass = ctx.createBiquadFilter();
    bass.type = 'lowshelf';
    bass.frequency.value = 180;

    const treble = ctx.createBiquadFilter();
    treble.type = 'highshelf';
    treble.frequency.value = 3500;

    const conv = ctx.createConvolver();
    conv.buffer = getAuraFXSynthesizer(ctx);

    const dry = ctx.createGain();
    const wet = ctx.createGain();

    src.connect(bass);
    bass.connect(treble);
    treble.connect(gain);

    gain.connect(dry);
    gain.connect(conv);
    conv.connect(wet);

    dry.connect(ctx.destination);
    wet.connect(ctx.destination);

    const bundle = { el, gain, bass, treble, dry, wet };
    mediaMap.set(el, bundle);
    return bundle;
  } catch (err) {
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
  document.querySelectorAll('video, audio').forEach((el) => {
    try {
      const speedMultiplier = Number(afxState.speed) || 1.0;

      // Natural analog relation: altering speed shifts pitch without artificial correction
      el.preservesPitch = false;
      el.webkitPreservesPitch = false;
      el.mozPreservesPitch = false;

      const targetRate = Math.max(0.1, Math.min(16, speedMultiplier));
      if (Math.abs(el.playbackRate - targetRate) > 0.01) {
        setPlaybackRateSafe(el, targetRate);
      }

      const node = hookMedia(el);
      if (!node) return;

      node.gain.gain.value = afxState.gain;
      node.bass.gain.value = afxState.bass;
      node.treble.gain.value = afxState.treble;

      node.dry.gain.value = Math.cos(afxState.reverb * 0.5 * Math.PI);
      node.wet.gain.value = Math.sin(afxState.reverb * 0.5 * Math.PI) * 0.8;
    } catch {
      // Ignore background or restricted element errors
    }
  });
}

function togglePanelVisibility() {
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

  await renderPresets("default");
}

initHUD();

// Listen only when media elements start playing to prevent memory spikes on feeds
document.addEventListener('play', (e) => {
  if (e.target instanceof HTMLMediaElement) {
    hookMedia(e.target);
    AuraFX_Modulations();
  }
}, true);

// Prevent players from resetting rate or pitch preservation
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

// Hotkey listener (Alt + H)
window.addEventListener('keydown', (e) => {
  if (e.altKey && (e.key === 'h' || e.key === 'H')) {
    e.preventDefault();
    e.stopImmediatePropagation();
    togglePanelVisibility();
  }
}, true);

if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((req) => {
    if (req.action === "TOGGLE_AURA_FX") {
      togglePanelVisibility();
    }
  });
}