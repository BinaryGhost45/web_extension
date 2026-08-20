/**
 * ============================================================================
 * Project:      Audio FX & Reverb Tool (AuraFX)
 * Author:       BinaryGhost45 (https://github.com/BinaryGhost45)
 * Description:  A real-time, in-browser Digital Signal Processing (DSP) suite
 *               and floating HUD for HTML5 media elements.
 * 
 * Core Features:
 *  - Real-Time Equalization: Biquad low-shelf bass boost and high-shelf treble control.
 *  - Spatial Convolution Reverb: Procedurally synthesized impulse response engine
 *    with constant-power dry/wet crossfading and high-frequency absorption.
 *  - Pitch & Speed Modulation: Semitone-accurate speed scaling without browser
 *    pitch compensation (Slowed / Sped effects).
 *  - Profile Management: Built-in acoustic presets (Studio, Empty Hall, etc.)
 *    alongside persistent custom user preset creation and deletion.
 *  - Adaptive Interface: Glassmorphic UI with dynamic Light/Dark themes and hotkey
 *    activation (Alt + H).
 *  - Dynamic Media Hooking: MutationObserver monitoring for seamless audio routing
 *    across SPAs and dynamically loaded video/audio streams.
 * ============================================================================
 */

let isPanelOpen = false;
let afxCtx = null;
const mediaMap = new WeakMap();

const BASE_STATE = Object.freeze({
  gain: 1.0,
  pitch: 0,
  bass: 0,
  treble: 0,
  reverb: 0
});

const afxState = { ...BASE_STATE };

const AURAFX_PRESETS = Object.freeze({
  "default": { name: "Default (Flat)", gain: 1.0, pitch: 0, bass: 0, treble: 0, reverb: 0 },
  "studio": { name: "Studio", gain: 1.05, pitch: 0, bass: 2.0, treble: 3.5, reverb: 0.08 },
  "empty_hall": { name: "Empty Hall", gain: 1.0, pitch: 0, bass: 1.5, treble: -1.0, reverb: 0.62 },
  "slowed_reverb": { name: "Slowed + Reverb", gain: 1.1, pitch: -3, bass: 4.5, treble: -2.0, reverb: 0.45 },
  "bass_boost": { name: "Bass Boost", gain: 1.0, pitch: 0, bass: 12.0, treble: 0.5, reverb: 0.04 },
  "vocal_clarity": { name: "Vocal Clarity", gain: 1.15, pitch: 0, bass: -3.0, treble: 6.0, reverb: 0.03 }
});

const STORAGE_KEYS = Object.freeze({
  PROFILES: 'aurafx_user_acoustic_profiles',
  THEME: 'aurafx_interface_theme'
});

function getProfiles() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.PROFILES);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    console.warn('[AuraFX] Read error:', e);
    return {};
  }
}

function saveProfile(name, params) {
  if (!name || typeof name !== 'string') return null;
  try {
    const list = getProfiles();
    const key = `usr_${Date.now()}`;
    list[key] = {
      name: name.trim(),
      gain: Number(params.gain) || 1.0,
      pitch: Number(params.pitch) || 0,
      bass: Number(params.bass) || 0,
      treble: Number(params.treble) || 0,
      reverb: Number(params.reverb) || 0
    };
    localStorage.setItem(STORAGE_KEYS.PROFILES, JSON.stringify(list));
    return key;
  } catch (e) {
    console.error('[AuraFX] Save error:', e);
    return null;
  }
}

function delProfile(key) {
  if (!key) return;
  try {
    const list = getProfiles();
    if (list[key]) {
      delete list[key];
      localStorage.setItem(STORAGE_KEYS.PROFILES, JSON.stringify(list));
    }
  } catch (e) {
    console.error('[AuraFX] Delete error:', e);
  }
}

function AuraFX_synthesizer(ctx, dur = 3.0, decay = 2.8) {
  if (!ctx || typeof ctx.createBuffer !== 'function') return null;

  const rate = ctx.sampleRate || 44100;
  const len = Math.max(1, Math.floor(rate * dur));
  const buf = ctx.createBuffer(2, len, rate);
  const chL = buf.getChannelData(0);
  const chR = buf.getChannelData(1);

  let lastL = 0;
  let lastR = 0;

  for (let i = 0; i < len; i++) {
    const env = Math.pow(1 - i / len, decay);
    const nL = (Math.random() * 2 - 1) * env;
    const nR = (Math.random() * 2 - 1) * env;

    lastL += 0.12 * (nL - lastL);
    lastR += 0.12 * (nR - lastR);

    chL[i] = lastL;
    chR[i] = lastR;
  }
  return buf;
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
  if (mediaMap.has(el)) return mediaMap.get(el);

  const ctx = getCtx();
  if (!ctx) return null;

  if (!el.crossOrigin && !el.src.startsWith('blob:') && !el.src.startsWith('data:')) {
    el.crossOrigin = "anonymous";
  }

  let src;
  try {
    src = ctx.createMediaElementSource(el);
  } catch (err) {
    return null;
  }

  try {
    const gain = ctx.createGain();
    gain.gain.value = afxState.gain;

    const bass = ctx.createBiquadFilter();
    bass.type = 'lowshelf';
    bass.frequency.value = 180;
    bass.gain.value = afxState.bass;

    const treble = ctx.createBiquadFilter();
    treble.type = 'highshelf';
    treble.frequency.value = 3500;
    treble.gain.value = afxState.treble;

    const conv = ctx.createConvolver();
    conv.buffer = AuraFX_synthesizer(ctx);

    const dry = ctx.createGain();
    const wet = ctx.createGain();

    dry.gain.value = Math.cos(afxState.reverb * 0.5 * Math.PI);
    wet.gain.value = Math.sin(afxState.reverb * 0.5 * Math.PI) * 0.8;

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
    console.error('[AuraFX] Hook error:', err);
    return null;
  }
}

function AuraFX_Modulations() {
  document.querySelectorAll('video, audio').forEach(el => {
    try {
      el.preservesPitch = false;
      const rate = Math.pow(2, afxState.pitch / 12);
      if (Number.isFinite(rate) && rate > 0) {
        el.playbackRate = rate;
      }

      const node = hookMedia(el);
      if (!node) return;

      node.gain.gain.value = afxState.gain;
      node.bass.gain.value = afxState.bass;
      node.treble.gain.value = afxState.treble;

      node.dry.gain.value = Math.cos(afxState.reverb * 0.5 * Math.PI);
      node.wet.gain.value = Math.sin(afxState.reverb * 0.5 * Math.PI) * 0.8;
    } catch (err) {
      console.warn('[AuraFX] Sync error:', err);
    }
  });
}

function initHUD() {
  if (document.getElementById('audio-fx-panel')) return;

  const panel = document.createElement('div');
  panel.id = 'audio-fx-panel';
  panel.className = 'hidden';

  let theme = 'dark';
  try {
    theme = localStorage.getItem(STORAGE_KEYS.THEME) || 'dark';
  } catch (e) {
    console.warn('[AuraFX] Theme read error:', e);
  }

  if (theme === 'light') {
    panel.classList.add('light-theme');
  }

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
        <span class="fx-val" id="fx-label-gain">100%</span>
      </div>
      <input type="range" class="fx-slider" id="fx-range-gain" min="0" max="3.5" step="0.05" value="1">
    </div>

    <div class="fx-control-group">
      <div class="fx-label-row">
        <span>Pitch (Slowed / Sped)</span>
        <span class="fx-val" id="fx-label-pitch">0 st</span>
      </div>
      <input type="range" class="fx-slider" id="fx-range-pitch" min="-8" max="8" step="1" value="0">
    </div>

    <div class="fx-control-group">
      <div class="fx-label-row">
        <span>Bass Boost</span>
        <span class="fx-val" id="fx-label-bass">0 dB</span>
      </div>
      <input type="range" class="fx-slider" id="fx-range-bass" min="-10" max="22" step="0.5" value="0">
    </div>

    <div class="fx-control-group">
      <div class="fx-label-row">
        <span>Treble</span>
        <span class="fx-val" id="fx-label-treble">0 dB</span>
      </div>
      <input type="range" class="fx-slider" id="fx-range-treble" min="-15" max="15" step="0.5" value="0">
    </div>

    <div class="fx-control-group">
      <div class="fx-label-row">
        <span>Reverb</span>
        <span class="fx-val" id="fx-label-reverb">0%</span>
      </div>
      <input type="range" class="fx-slider" id="fx-range-reverb" min="0" max="1" step="0.01" value="0">
    </div>
  `;

  document.body.appendChild(panel);

  ['click', 'mousedown', 'keydown'].forEach(evt => {
    panel.addEventListener(evt, e => e.stopPropagation());
  });

  const btnTheme = panel.querySelector('#fx-btn-theme');
  const btnReset = panel.querySelector('#fx-btn-reset');
  const selPreset = panel.querySelector('#fx-dropdown-preset');
  const inputPreset = panel.querySelector('#fx-input-preset');
  const btnSave = panel.querySelector('#fx-btn-save-preset');
  const btnDel = panel.querySelector('#fx-btn-del-preset');

  const inGain = panel.querySelector('#fx-range-gain');
  const inPitch = panel.querySelector('#fx-range-pitch');
  const inBass = panel.querySelector('#fx-range-bass');
  const inTreble = panel.querySelector('#fx-range-treble');
  const inReverb = panel.querySelector('#fx-range-reverb');

  const lblGain = panel.querySelector('#fx-label-gain');
  const lblPitch = panel.querySelector('#fx-label-pitch');
  const lblBass = panel.querySelector('#fx-label-bass');
  const lblTreble = panel.querySelector('#fx-label-treble');
  const lblReverb = panel.querySelector('#fx-label-reverb');

  function renderPresets(activeKey = "default") {
    selPreset.innerHTML = '';

    const grpBuiltin = document.createElement('optgroup');
    grpBuiltin.label = 'Built-in Presets';
    Object.keys(AURAFX_PRESETS).forEach(k => {
      const opt = document.createElement('option');
      opt.value = k;
      opt.textContent = AURAFX_PRESETS[k].name;
      grpBuiltin.appendChild(opt);
    });
    selPreset.appendChild(grpBuiltin);

    const userList = getProfiles();
    const userKeys = Object.keys(userList);
    if (userKeys.length > 0) {
      const grpCustom = document.createElement('optgroup');
      grpCustom.label = 'Custom Presets';
      userKeys.forEach(k => {
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
      afxCtx.resume().catch(e => console.warn('[AuraFX] Resume error:', e));
    }
    AuraFX_Modulations();
  }

  function updateHUD() {
    inGain.value = afxState.gain;
    inPitch.value = afxState.pitch;
    inBass.value = afxState.bass;
    inTreble.value = afxState.treble;
    inReverb.value = afxState.reverb;

    lblGain.textContent = `${Math.round(afxState.gain * 100)}%`;
    lblPitch.textContent = `${afxState.pitch > 0 ? '+' : ''}${afxState.pitch} st`;
    lblBass.textContent = `${afxState.bass > 0 ? '+' : ''}${afxState.bass} dB`;
    lblTreble.textContent = `${afxState.treble > 0 ? '+' : ''}${afxState.treble} dB`;
    lblReverb.textContent = `${Math.round(afxState.reverb * 100)}%`;
  }

  function loadProfile(p) {
    if (!p) return;
    afxState.gain = p.gain;
    afxState.pitch = p.pitch;
    afxState.bass = p.bass;
    afxState.treble = p.treble;
    afxState.reverb = p.reverb;
    updateHUD();
    applyFX();
  }

  btnTheme.addEventListener('click', () => {
    panel.classList.toggle('light-theme');
    const isLight = panel.classList.contains('light-theme');
    btnTheme.textContent = isLight ? '🌙 Dark' : '☀️ Light';
    try {
      localStorage.setItem(STORAGE_KEYS.THEME, isLight ? 'light' : 'dark');
    } catch (e) {
      console.warn('[AuraFX] Theme save error:', e);
    }
  });

  selPreset.addEventListener('change', (e) => {
    const k = e.target.value;
    btnDel.style.display = k.startsWith('usr_') ? 'inline-block' : 'none';
    if (AURAFX_PRESETS[k]) {
      loadProfile(AURAFX_PRESETS[k]);
    } else {
      const list = getProfiles();
      if (list[k]) loadProfile(list[k]);
    }
  });

  btnSave.addEventListener('click', () => {
    const name = inputPreset.value.trim();
    if (!name) return;
    const k = saveProfile(name, { ...afxState });
    if (k) {
      inputPreset.value = '';
      renderPresets(k);
    }
  });

  btnDel.addEventListener('click', () => {
    const k = selPreset.value;
    if (k.startsWith('usr_')) {
      delProfile(k);
      renderPresets("default");
      loadProfile(AURAFX_PRESETS["default"]);
    }
  });

  inGain.addEventListener('input', (e) => {
    afxState.gain = parseFloat(e.target.value);
    lblGain.textContent = `${Math.round(afxState.gain * 100)}%`;
    applyFX();
  });

  inPitch.addEventListener('input', (e) => {
    afxState.pitch = parseInt(e.target.value, 10);
    lblPitch.textContent = `${afxState.pitch > 0 ? '+' : ''}${afxState.pitch} st`;
    applyFX();
  });

  inBass.addEventListener('input', (e) => {
    afxState.bass = parseFloat(e.target.value);
    lblBass.textContent = `${afxState.bass > 0 ? '+' : ''}${afxState.bass} dB`;
    applyFX();
  });

  inTreble.addEventListener('input', (e) => {
    afxState.treble = parseFloat(e.target.value);
    lblTreble.textContent = `${afxState.treble > 0 ? '+' : ''}${afxState.treble} dB`;
    applyFX();
  });

  inReverb.addEventListener('input', (e) => {
    afxState.reverb = parseFloat(e.target.value);
    lblReverb.textContent = `${Math.round(afxState.reverb * 100)}%`;
    applyFX();
  });

  btnReset.addEventListener('click', () => {
    loadProfile(BASE_STATE);
    renderPresets("default");
  });

  renderPresets("default");
}

initHUD();

const domObserver = new MutationObserver((mutations) => {
  for (const m of mutations) {
    for (const node of m.addedNodes) {
      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      if (node.matches('video, audio')) hookMedia(node);
      if (typeof node.querySelectorAll === 'function') {
        node.querySelectorAll('video, audio').forEach(hookMedia);
      }
    }
  }
});

domObserver.observe(document.documentElement, { childList: true, subtree: true });

window.addEventListener('keydown', (e) => {
  if (e.altKey && (e.key === 'h' || e.key === 'H')) {
    e.preventDefault();
    e.stopImmediatePropagation();
    isPanelOpen = !isPanelOpen;

    if (afxCtx && afxCtx.state === 'suspended') {
      afxCtx.resume().catch(err => console.warn('[AuraFX] Hotkey resume error:', err));
    }

    const panel = document.getElementById('audio-fx-panel');
    if (panel) {
      panel.classList.toggle('hidden', !isPanelOpen);
    }
  }
}, true);