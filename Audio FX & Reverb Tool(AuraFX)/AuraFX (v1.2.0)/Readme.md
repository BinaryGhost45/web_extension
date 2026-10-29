### Version 1.2.0

* **Resolved Native Speed Lock**  
  Eliminated recursive `ratechange` event loops that previously overrode and blocked native video speed controls on platforms like YouTube.

* **Bi-Directional Speed Synchronization**  
  Playback speed adjustments made through native site controls or default hotkeys automatically sync back to the HUD's speed slider in real time.

* **Analog Pitch-Speed Interlink**  
  Linked pitch directly to speed using the acoustic formula `speed = 2^(pitch / 12)` and disabled `preservesPitch` to replicate natural analog tape and vinyl playback behavior.

* **Added "Sped Up" Preset**  
  Introduced a built-in preset configured with 1.30x speed, +2 semitones pitch, +2.5 dB bass, +3.0 dB treble, and 5% wet reverb.

* **Toolbar Icon Activation**  
  Added an extension action trigger and background service worker to toggle the floating HUD directly upon clicking the browser toolbar icon.

* **Repositioned Shortcut Hint**  
  Relocated the `Press Alt + H to show / hide` indicator from the top header down to a dedicated footer below the control sliders for a cleaner interface.
