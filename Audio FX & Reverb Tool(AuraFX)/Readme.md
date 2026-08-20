# Audio FX & Reverb Tool (AuraFX)

A real-time, in-browser Digital Signal Processing (DSP) suite and floating HUD overlay for HTML5 media elements. It injects equalization, pitch/speed modulation, and spatial convolution reverb directly into any HTML5 audio or video element across Chromium browsers.

## Demo

https://x.com/Binary_Ghost45/status/2090344425587417488

> **Demo Audio Track:** Warriyo - Mortals (feat. Laura Brehm) [NCS Release]  
> **Music provided by:** NoCopyrightSounds



## Key Features

* **Real-Time Equalization:** High-precision Biquad low-shelf bass boost at 180 Hz and high-shelf treble control at 3500 Hz.
* **Procedural Convolution Reverb:** Synthesized stereo impulse response with constant-power dry/wet crossfading and high-frequency absorption.
* **Pitch and Speed Modulation:** Semitone-accurate speed scaling without browser pitch compensation for slowed and sped audio effects.
* **Profile and Preset Engine:** Factory acoustic presets (Studio, Empty Hall, Slowed + Reverb, Bass Boost, Vocal Clarity) with local custom profile creation, persistence, and deletion.
* **Adaptive Interface:** Glassmorphic HUD with dynamic Light and Dark themes, persistent settings, and global hotkey activation.
* **Dynamic Media Observer:** MutationObserver monitoring that automatically attaches DSP pipelines to dynamic media streams, single-page application route transitions, and infinite feeds.

## Controls and Ranges

| Control | Range / Shortcut | Details |
|---|---|---|
| Toggle Interface | Alt + H | Global HUD visibility toggle |
| Volume Gain | 0% to 350% | Linear master amplification |
| Pitch Shift | -8 st to +8 st | Semitone-stepped speed/pitch scale |
| Bass Boost | -10 dB to +22 dB | Low-shelf EQ (180 Hz cutoff) |
| Treble | -15 dB to +15 dB | High-shelf EQ (3500 Hz cutoff) |
| Reverb Mix | 0% to 100% | Constant-power wet signal ratio |

