```text
================================================================================
                        AUDIO FX & REVERB TOOL (AURAFX)
                          Real-Time In-Browser DSP Suite
================================================================================

Version: 1.2.2
Author:  BinaryGhost45
Manifest: V3 (Chrome / Chromium-Based Browsers)

--------------------------------------------------------------------------------
OVERVIEW
--------------------------------------------------------------------------------
AuraFX is a lightweight, real-time Digital Signal Processing (DSP) suite and 
floating HUD for HTML5 <video> and <audio> elements across any website. Built 
on the native Web Audio API, it gives you studio-grade control over gain, 
playback speed, analog pitch shifting, EQ shelving, and convolution reverb 
without altering site layouts or draining system RAM.

--------------------------------------------------------------------------------
KEY FEATURES
--------------------------------------------------------------------------------
* Lazy-Loaded Zero-Footprint Startup
  Remains completely dormant on page load with zero DOM injection and zero 
  AudioContext overhead until triggered via Alt + H or the toolbar icon.

* Shared-Bus DSP Architecture
  Routes active media elements through a single shared Web Audio processing 
  bus per tab and prunes detached DOM nodes on infinite-scroll feeds (X, 
  Instagram, YouTube), preventing ConvolverNode memory leaks and video stalls.

* Analog Pitch-Speed Interlink
  Links pitch directly to playback speed using the acoustic formula 
  speed = 2^(pitch / 12) with preservesPitch disabled for authentic tape and 
  vinyl behavior.

* Bi-Directional Speed Synchronization
  Adjustments made through native site players or default hotkeys sync back 
  to the AuraFX HUD sliders in real time without recursive event loops.

* Built-In & Custom Presets with Sync + Backup
  Includes 7 calibrated presets (Default, Studio, Empty Hall, Slowed + Reverb, 
  Sped Up, Bass Boost, Vocal Clarity). Custom presets persist across restarts 
  via chrome.storage.sync and can be exported/imported as portable JSON files.

* Dual-Theme Floating HUD
  Glassmorphic floating control panel with Dark and Light themes, numeric 
  precision inputs, and isolated keyboard/mouse event handling.

--------------------------------------------------------------------------------
CONTROLS & PARAMETERS
--------------------------------------------------------------------------------
Parameter       Range               Step     Description
--------------------------------------------------------------------------------
Volume (Gain)   0.00x to 3.50x      0.05     Clean pre-output amplification
Speed           0.25x to 4.00x      0.05     HTML5 playbackRate multiplier
Pitch           -12.0 to +12.0 st   0.5      Semitone shift linked to speed
Bass Boost      -10.0 to +22.0 dB   0.5      Lowshelf biquad filter at 180 Hz
Treble          -15.0 to +15.0 dB   0.5      Highshelf biquad filter at 3500 Hz
Reverb          0.00 to 1.00        0.01     Equal-power wet/dry stereo impulse

--------------------------------------------------------------------------------
INSTALLATION (DEVELOPER MODE)
--------------------------------------------------------------------------------
1. Download or clone this repository containing manifest.json, background.js, 
   logic.js, and popup.css.
2. Open Chrome and navigate to chrome://extensions.
3. Enable "Developer mode" in the top-right corner.
4. Click "Load unpacked" and select the project directory.
5. Open any webpage with media and press Alt + H (or click the toolbar icon) 
   to activate the HUD.

--------------------------------------------------------------------------------
KEYBOARD SHORTCUTS
--------------------------------------------------------------------------------
* Alt + H : Activate AuraFX and toggle HUD visibility

--------------------------------------------------------------------------------
CHANGELOG
--------------------------------------------------------------------------------
[v1.2.2]
* Fixed YouTube MSE playback errors across single-page video navigations by 
  replacing destructive 'emptied' node disconnections with periodic DOM 
  detachment cleanup.
* Deferred audio graph hooking to 'playing' / 'loadeddata' events once media 
  buffers reach HAVE_CURRENT_DATA (readyState >= 2), ensuring clean playback 
  across YouTube, X, and Instagram.

[v1.2.1]
* Implemented lazy activation so the extension stays dormant until Alt + H or 
  the toolbar icon is clicked.
* Replaced per-video ConvolverNode creation with a single shared DSP bus and 
  added automatic cleanup to eliminate RAM spikes and video freezing on X and 
  Instagram.
* Migrated preset storage to chrome.storage.sync and added JSON Export/Import 
  buttons in the HUD footer.

[v1.2.0]
* Resolved native speed lock and recursive ratechange event loops.
* Added bi-directional speed synchronization with native player controls.
* Added analog pitch-speed interlink (speed = 2^(pitch / 12)).
* Added "Sped Up" built-in preset and toolbar icon toggle.
* Relocated shortcut hint to the bottom footer.
================================================================================
```