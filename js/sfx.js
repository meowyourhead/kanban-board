/*
 * sfx.js — small synthesized sound effects, a different set for every theme.
 * Nothing is downloaded or stored: the sounds are generated with the Web Audio API.
 *
 *   KanbanSfx.play('check' | 'uncheck' | 'add' | 'delete' | 'move' | 'archive' | 'restore' | 'open' | 'close' | 'theme')
 *   KanbanSfx.setTheme(name)      which kit to use
 *   KanbanSfx.setEnabled(bool)    saved in localStorage ("kanban.sound.v1")
 */
(function () {
  'use strict';

  var KEY = 'kanban.sound.v1';
  var ctx = null, master = null, theme = 'claude', on = true, lastAt = {};
  try { on = window.localStorage.getItem(KEY) !== '0'; } catch (e) { /* default on */ }

  // ---- step builders -------------------------------------------------------------------------
  // T(freq,dur,type,gain,delay,slideTo,lowpass,attack)  tone; optional pitch slide, low-pass, attack
  // S(freq,dur,gain,delay,lowpass,attack)               soft sine (T with no slide)
  // B(freq,dur,gain,delay)                              struck metal / crystal bell (inharmonic partials)
  // N(dur,gain,filter,f0,f1,delay)                      filtered noise burst
  function T(f, d, ty, g, dl, to, lp, atk) {
    return { k: 't', f: f, d: d, ty: ty || 'sine', g: g == null ? 0.2 : g, dl: dl || 0, to: to, lp: lp, atk: atk };
  }
  function S(f, d, g, dl, lp, atk) { return T(f, d, 'sine', g, dl, undefined, lp, atk); }
  function B(f, d, g, dl) { return { k: 'b', f: f, d: d, g: g == null ? 0.2 : g, dl: dl || 0 }; }
  function N(d, g, fl, f0, f1, dl) {
    return { k: 'n', d: d, g: g == null ? 0.2 : g, fl: fl || 'bandpass', f0: f0 || 2000, f1: f1 || f0 || 2000, dl: dl || 0 };
  }

  // inharmonic partials [freq-ratio, gain-ratio, dur-ratio] — what makes B() ring like struck metal
  var BELL = [[1, 1.0, 1.0], [2.0, 0.5, 0.72], [3.01, 0.28, 0.55], [4.24, 0.14, 0.42]];

  // ---- the kits -------------------------------------------------------------------------------
  var KITS = {
    // brutal: hard square-wave stabs
    brutal: {
      check:   [T(660, 0.06, 'square', 0.16), T(990, 0.09, 'square', 0.16, 0.06)],
      uncheck: [T(330, 0.1, 'square', 0.16, 0, 220)],
      add:     [T(220, 0.05, 'square', 0.18), T(440, 0.09, 'square', 0.18, 0.05)],
      delete:  [T(160, 0.22, 'sawtooth', 0.22, 0, 45, 1200), N(0.14, 0.3, 'lowpass', 900, 200)],
      move:    [T(200, 0.05, 'square', 0.18), T(150, 0.06, 'square', 0.16, 0.05)],
      archive: [T(330, 0.06, 'square', 0.16), T(220, 0.06, 'square', 0.16, 0.06), T(110, 0.12, 'square', 0.18, 0.12)],
      restore: [T(110, 0.06, 'square', 0.16), T(220, 0.06, 'square', 0.16, 0.06), T(330, 0.12, 'square', 0.18, 0.12)],
      open:    [T(400, 0.05, 'square', 0.14), T(600, 0.07, 'square', 0.14, 0.05)],
      close:   [T(600, 0.05, 'square', 0.14), T(400, 0.07, 'square', 0.14, 0.05)],
      theme:   [T(300, 0.06, 'square', 0.16), T(450, 0.06, 'square', 0.16, 0.07), T(300, 0.1, 'square', 0.16, 0.14)]
    },
    // riso: rubber-stamp thunks and print scratches
    riso: {
      check:   [T(300, 0.08, 'sine', 0.35, 0, 110), N(0.04, 0.3, 'bandpass', 2500)],
      uncheck: [T(200, 0.08, 'sine', 0.3, 0, 90), N(0.04, 0.22, 'bandpass', 1500)],
      add:     [T(520, 0.09, 'triangle', 0.2), T(780, 0.12, 'triangle', 0.2, 0.07)],
      delete:  [N(0.3, 0.38, 'highpass', 5000, 1500), T(95, 0.18, 'sine', 0.3, 0.05, 55)],
      move:    [T(260, 0.07, 'sine', 0.3, 0, 130), N(0.03, 0.2, 'bandpass', 1800)],
      archive: [T(400, 0.08, 'triangle', 0.2, 0, 220), T(190, 0.14, 'sine', 0.3, 0.08, 90)],
      restore: [T(220, 0.08, 'triangle', 0.2), T(440, 0.12, 'triangle', 0.2, 0.07)],
      open:    [T(620, 0.06, 'triangle', 0.18), T(930, 0.08, 'triangle', 0.16, 0.05)],
      close:   [T(930, 0.06, 'triangle', 0.16), T(620, 0.08, 'triangle', 0.16, 0.05)],
      theme:   [T(300, 0.07, 'sine', 0.3, 0, 120), T(420, 0.07, 'sine', 0.3, 0.1, 170)]
    },
    // blueprint: drafting-instrument clicks and a compass ping
    blueprint: {
      check:   [T(1700, 0.012, 'square', 0.1), T(2400, 0.015, 'square', 0.1, 0.06), B(1319, 0.3, 0.09, 0.07)],
      uncheck: [T(2000, 0.012, 'square', 0.1), T(1400, 0.015, 'square', 0.1, 0.06)],
      add:     [T(1760, 0.012, 'square', 0.09), B(1568, 0.4, 0.1, 0.03)],
      delete:  [T(1800, 0.012, 'square', 0.1), T(900, 0.012, 'square', 0.1, 0.07), T(450, 0.1, 'sine', 0.2, 0.14, 220)],
      move:    [T(1200, 0.012, 'square', 0.1), T(1500, 0.012, 'square', 0.1, 0.05)],
      archive: [T(1500, 0.012, 'square', 0.09), B(880, 0.34, 0.08, 0.05)],
      restore: [T(880, 0.012, 'square', 0.09), B(1568, 0.34, 0.08, 0.05)],
      open:    [T(2000, 0.01, 'square', 0.08), T(2600, 0.01, 'square', 0.08, 0.04)],
      close:   [T(2600, 0.01, 'square', 0.08), T(2000, 0.01, 'square', 0.08, 0.04)],
      theme:   [B(1319, 0.36, 0.1), B(1760, 0.42, 0.09, 0.1)]
    },
    // cyberpunk: filtered synth blips and glitchy sweeps
    cyberpunk: {
      check:   [T(880, 0.05, 'sawtooth', 0.12, 0, undefined, 2600), T(1320, 0.09, 'sawtooth', 0.12, 0.05, undefined, 3200)],
      uncheck: [T(1320, 0.05, 'sawtooth', 0.12, 0, undefined, 2800), T(660, 0.1, 'sawtooth', 0.12, 0.05, undefined, 2200)],
      add:     [T(440, 0.05, 'sawtooth', 0.12, 0, undefined, 2400), T(660, 0.05, 'sawtooth', 0.12, 0.05, undefined, 2800), T(880, 0.1, 'sawtooth', 0.12, 0.1, undefined, 3400)],
      delete:  [T(900, 0.28, 'sawtooth', 0.16, 0, 70, 2000), N(0.2, 0.22, 'highpass', 6000, 1500, 0.02), T(60, 0.15, 'square', 0.12, 0.12, undefined, 400)],
      move:    [T(300, 0.09, 'sawtooth', 0.12, 0, 640, 2600)],
      archive: [T(880, 0.05, 'sawtooth', 0.11, 0, undefined, 2400), T(660, 0.05, 'sawtooth', 0.11, 0.05, undefined, 2200), T(440, 0.12, 'sawtooth', 0.11, 0.1, undefined, 2000)],
      restore: [T(440, 0.05, 'sawtooth', 0.11, 0, undefined, 2000), T(660, 0.05, 'sawtooth', 0.11, 0.05, undefined, 2200), T(990, 0.12, 'sawtooth', 0.11, 0.1, undefined, 3000)],
      open:    [T(500, 0.07, 'square', 0.09, 0, 1100, 3600)],
      close:   [T(1100, 0.07, 'square', 0.09, 0, 500, 3600)],
      theme:   [T(220, 0.08, 'sawtooth', 0.12, 0, 880, 2800), T(1320, 0.05, 'square', 0.07, 0.08, undefined, 4000), N(0.08, 0.15, 'highpass', 5000, 2000, 0.1)]
    },
    // claude: warm marimba-like tones
    claude: {
      check:   [T(659, 0.3, 'triangle', 0.2, 0, undefined, 3200, 0.012), T(988, 0.36, 'sine', 0.12, 0.08, undefined, 3600, 0.012)],
      uncheck: [T(494, 0.28, 'triangle', 0.18, 0, undefined, 2800, 0.012), T(392, 0.34, 'sine', 0.1, 0.08, undefined, 2600, 0.012)],
      add:     [T(523, 0.24, 'triangle', 0.18, 0, undefined, 3000, 0.012), T(659, 0.28, 'triangle', 0.18, 0.08, undefined, 3200, 0.012), T(784, 0.36, 'sine', 0.12, 0.16, undefined, 3400, 0.012)],
      delete:  [T(330, 0.32, 'triangle', 0.18, 0, 247, 2600, 0.012), T(247, 0.42, 'sine', 0.12, 0.1, undefined, 2400, 0.012)],
      move:    [T(440, 0.18, 'triangle', 0.16, 0, undefined, 2800, 0.01), T(554, 0.22, 'triangle', 0.14, 0.07, undefined, 3000, 0.01)],
      archive: [T(587, 0.2, 'triangle', 0.16, 0, undefined, 2800, 0.01), T(440, 0.26, 'triangle', 0.16, 0.09, undefined, 2600, 0.01), T(330, 0.34, 'sine', 0.1, 0.18, undefined, 2400, 0.01)],
      restore: [T(330, 0.2, 'triangle', 0.16, 0, undefined, 2600, 0.01), T(440, 0.24, 'triangle', 0.16, 0.09, undefined, 2800, 0.01), T(587, 0.3, 'sine', 0.1, 0.18, undefined, 3000, 0.01)],
      open:    [T(587, 0.18, 'triangle', 0.14, 0, undefined, 3000, 0.01), T(880, 0.24, 'sine', 0.08, 0.06, undefined, 3400, 0.01)],
      close:   [T(880, 0.14, 'triangle', 0.12, 0, undefined, 3400, 0.01), T(587, 0.22, 'sine', 0.1, 0.06, undefined, 3000, 0.01)],
      theme:   [T(523, 0.2, 'triangle', 0.16, 0, undefined, 3000, 0.01), T(784, 0.2, 'triangle', 0.16, 0.1, undefined, 3400, 0.01), T(1047, 0.38, 'sine', 0.1, 0.2, undefined, 3800, 0.01)]
    },
    // ios-glass: glassy bells and soft pings
    'ios-glass': {
      check:   [B(1568, 0.5, 0.14), T(2093, 0.3, 'sine', 0.05, 0.05, undefined, 6000)],
      uncheck: [B(1175, 0.4, 0.12), T(880, 0.3, 'sine', 0.06, 0.05, undefined, 4000)],
      add:     [B(1319, 0.42, 0.12), B(1760, 0.48, 0.11, 0.09), B(2349, 0.5, 0.07, 0.18)],
      delete:  [T(784, 0.32, 'sine', 0.16, 0, 523, 3000), T(392, 0.42, 'sine', 0.1, 0.09, undefined, 2200)],
      move:    [B(1047, 0.34, 0.1), B(1319, 0.38, 0.08, 0.05)],
      archive: [B(1568, 0.34, 0.1), B(1175, 0.4, 0.09, 0.08), B(784, 0.44, 0.07, 0.16)],
      restore: [B(784, 0.34, 0.1), B(1175, 0.4, 0.09, 0.08), B(1568, 0.46, 0.08, 0.16)],
      open:    [T(1397, 0.2, 'sine', 0.12, 0, undefined, 5000, 0.01), T(1865, 0.26, 'sine', 0.08, 0.05, undefined, 6000, 0.01)],
      close:   [T(1865, 0.16, 'sine', 0.1, 0, undefined, 6000, 0.01), T(1397, 0.24, 'sine', 0.1, 0.05, undefined, 5000, 0.01)],
      theme:   [B(1175, 0.4, 0.1), B(1568, 0.42, 0.1, 0.1), B(1976, 0.5, 0.07, 0.2)]
    },
    // swiss: minimal, precise ticks
    swiss: {
      check:   [T(1200, 0.045, 'sine', 0.22, 0, undefined, 6000, 0.003)],
      uncheck: [T(760, 0.045, 'sine', 0.2, 0, undefined, 5000, 0.003)],
      add:     [T(900, 0.04, 'sine', 0.2, 0, undefined, 5000, 0.003), T(1350, 0.05, 'sine', 0.2, 0.06, undefined, 7000, 0.003)],
      delete:  [T(340, 0.09, 'sine', 0.26, 0, 240, 3000, 0.003)],
      move:    [T(620, 0.035, 'sine', 0.2, 0, undefined, 4000, 0.003)],
      archive: [T(900, 0.04, 'sine', 0.18, 0, undefined, 5000, 0.003), T(450, 0.07, 'sine', 0.2, 0.06, undefined, 3200, 0.003)],
      restore: [T(450, 0.04, 'sine', 0.18, 0, undefined, 3200, 0.003), T(900, 0.07, 'sine', 0.2, 0.06, undefined, 5000, 0.003)],
      open:    [T(1000, 0.03, 'sine', 0.16, 0, undefined, 6000, 0.003)],
      close:   [T(700, 0.03, 'sine', 0.16, 0, undefined, 4000, 0.003)],
      theme:   [T(800, 0.04, 'sine', 0.18, 0, undefined, 5000, 0.003), T(1000, 0.04, 'sine', 0.18, 0.06, undefined, 6000, 0.003), T(1200, 0.05, 'sine', 0.18, 0.12, undefined, 7000, 0.003)]
    },
    // pixel: cosy farm life. Wood knocks, plucked strings, a little pickup "pop" and a soft harvest bell
    pixel: {
      check:   [T(587, 0.07, 'triangle', 0.2, 0, 880, 3600, 0.003), B(1175, 0.4, 0.08, 0.06)],
      uncheck: [T(660, 0.08, 'triangle', 0.18, 0, 392, 2800, 0.003)],
      add:     [N(0.04, 0.18, 'lowpass', 900, 400), T(392, 0.16, 'triangle', 0.17, 0.03, undefined, 3000, 0.004), T(494, 0.16, 'triangle', 0.17, 0.1, undefined, 3000, 0.004), T(659, 0.26, 'triangle', 0.17, 0.17, undefined, 3400, 0.004)],
      delete:  [T(196, 0.12, 'triangle', 0.26, 0, 98, 1400, 0.003), N(0.12, 0.22, 'lowpass', 1100, 260, 0.02)],
      move:    [T(240, 0.05, 'triangle', 0.24, 0, 160, 1800, 0.002), N(0.03, 0.16, 'bandpass', 1300)],
      archive: [T(494, 0.14, 'triangle', 0.16, 0, undefined, 2800, 0.004), T(392, 0.14, 'triangle', 0.16, 0.08, undefined, 2600, 0.004), T(220, 0.14, 'triangle', 0.22, 0.17, 150, 1600, 0.003)],
      restore: [T(220, 0.08, 'triangle', 0.2, 0, undefined, 1800, 0.003), T(392, 0.14, 'triangle', 0.16, 0.08, undefined, 2600, 0.004), T(587, 0.22, 'triangle', 0.16, 0.16, undefined, 3200, 0.004)],
      open:    [T(300, 0.04, 'triangle', 0.22, 0, 220, 2000, 0.002), T(659, 0.14, 'triangle', 0.12, 0.05, undefined, 3400, 0.004)],
      close:   [T(523, 0.08, 'triangle', 0.12, 0, undefined, 3000, 0.004), T(220, 0.06, 'triangle', 0.22, 0.05, 150, 1600, 0.002)],
      theme:   [T(392, 0.16, 'triangle', 0.16, 0, undefined, 3000, 0.004), T(523, 0.16, 'triangle', 0.16, 0.11, undefined, 3200, 0.004), T(659, 0.16, 'triangle', 0.16, 0.22, undefined, 3400, 0.004), B(1047, 0.5, 0.07, 0.33)]
    },
    // genshin: soft airy taps, bright crystal chimes and bell arpeggios
    genshin: {
      check:   [T(880, 0.06, 'triangle', 0.08, 0, undefined, 4000, 0.004), B(1175, 0.42, 0.08, 0.035), B(1760, 0.5, 0.04, 0.09)],
      uncheck: [T(659, 0.07, 'triangle', 0.08, 0, undefined, 3200, 0.004), S(494, 0.24, 0.07, 0.05, 2400, 0.01)],
      add:     [B(659, 0.4, 0.07), B(880, 0.42, 0.07, 0.06), B(1175, 0.44, 0.07, 0.12), B(1568, 0.5, 0.05, 0.18)],
      delete:  [T(494, 0.1, 'triangle', 0.09, 0, 330, 2600, 0.004), N(0.12, 0.08, 'lowpass', 1200, 500, 0.02), S(330, 0.3, 0.07, 0.09, 2000, 0.01)],
      move:    [N(0.12, 0.12, 'highpass', 900, 3400), T(990, 0.07, 'triangle', 0.07, 0.04, undefined, 4000, 0.004)],
      archive: [N(0.16, 0.1, 'bandpass', 4200, 900), B(523, 0.4, 0.06, 0.1)],
      restore: [N(0.16, 0.1, 'bandpass', 900, 4200), B(784, 0.4, 0.06, 0.1)],
      open:    [N(0.16, 0.09, 'highpass', 700, 3800), B(1175, 0.42, 0.05, 0.06), B(1760, 0.48, 0.035, 0.12)],
      close:   [N(0.14, 0.08, 'highpass', 3800, 700), S(880, 0.24, 0.06, 0.05, 3200, 0.01)],
      theme:   [B(784, 0.42, 0.06), B(1047, 0.44, 0.06, 0.07), B(1319, 0.48, 0.055, 0.14), B(2093, 0.55, 0.03, 0.2)]
    },
    // nier: soft machine blips and hollow terminal chimes
    nier: {
      check:   [S(880, 0.06, 0.15, 0, 4000, 0.004), S(1174, 0.16, 0.11, 0.05, 5000, 0.006)],
      uncheck: [S(660, 0.06, 0.13, 0, 3600, 0.004), S(494, 0.14, 0.09, 0.05, 2800, 0.006)],
      add:     [S(523, 0.05, 0.13, 0, 3000, 0.004), S(698, 0.05, 0.13, 0.06, 3600, 0.004), B(880, 0.4, 0.09, 0.12)],
      delete:  [T(392, 0.1, 'sine', 0.15, 0, 233, 2600, 0.004), N(0.12, 0.14, 'lowpass', 1400, 400)],
      move:    [T(300, 0.09, 'sine', 0.14, 0, 600, 3000, 0.004), S(600, 0.07, 0.1, 0.08, 3600, 0.004)],
      archive: [S(784, 0.06, 0.11, 0, 4200, 0.004), S(587, 0.06, 0.11, 0.06, 3400, 0.004), S(392, 0.16, 0.09, 0.12, 2600, 0.006)],
      restore: [S(392, 0.06, 0.11, 0, 2600, 0.004), S(587, 0.06, 0.11, 0.06, 3400, 0.004), S(784, 0.16, 0.09, 0.12, 4200, 0.006)],
      open:    [S(1046, 0.05, 0.11, 0, 4600, 0.004), B(1568, 0.42, 0.07, 0.05)],
      close:   [S(1568, 0.05, 0.09, 0, 6000, 0.004), S(1046, 0.12, 0.08, 0.05, 4600, 0.006)],
      theme:   [S(440, 0.06, 0.11, 0, 3000, 0.004), S(587, 0.06, 0.11, 0.06, 3400, 0.004), S(880, 0.06, 0.11, 0.12, 4200, 0.004), B(1174, 0.46, 0.08, 0.18)]
    },
    // fallout: Pip-Boy terminal beeps, a Geiger rattle and low vault clunks
    fallout: {
      check:   [T(1046, 0.05, 'square', 0.12, 0, undefined, 6000), T(1568, 0.18, 'square', 0.1, 0.05, undefined, 7000)],
      uncheck: [T(784, 0.05, 'square', 0.1, 0, undefined, 5000), T(523, 0.14, 'square', 0.1, 0.05, undefined, 4000)],
      add:     [T(659, 0.045, 'square', 0.1, 0, undefined, 5000), T(988, 0.045, 'square', 0.1, 0.055, undefined, 6000), T(1319, 0.13, 'square', 0.1, 0.11, undefined, 7000)],
      delete:  [N(0.18, 0.22, 'bandpass', 2600, 700), T(160, 0.26, 'square', 0.16, 0, 60, 1200), T(80, 0.16, 'square', 0.12, 0.16, undefined, 700)],
      move:    [T(330, 0.09, 'square', 0.11, 0, 720, 3000)],
      archive: [T(523, 0.05, 'square', 0.1, 0, undefined, 4000), T(392, 0.05, 'square', 0.1, 0.05, undefined, 3400), T(262, 0.14, 'square', 0.12, 0.1, undefined, 2600)],
      restore: [T(262, 0.05, 'square', 0.1, 0, undefined, 2600), T(392, 0.05, 'square', 0.1, 0.05, undefined, 3400), T(523, 0.14, 'square', 0.1, 0.1, undefined, 4000)],
      open:    [T(1046, 0.045, 'square', 0.09, 0, undefined, 6000), T(1397, 0.09, 'square', 0.09, 0.045, undefined, 7000)],
      close:   [T(1397, 0.045, 'square', 0.09, 0, undefined, 7000), T(1046, 0.09, 'square', 0.09, 0.045, undefined, 6000)],
      theme:   [T(523, 0.05, 'square', 0.1, 0, undefined, 4000), T(659, 0.05, 'square', 0.1, 0.06, undefined, 5000), T(784, 0.05, 'square', 0.1, 0.12, undefined, 5500), T(1046, 0.18, 'square', 0.1, 0.18, undefined, 6000)]
    }
  };

  // ---- playback ---------------------------------------------------------------------------------
  function ensure() {
    if (ctx) return ctx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
      var comp = ctx.createDynamicsCompressor();
      master = ctx.createGain();
      master.gain.value = 0.7;
      master.connect(comp);
      comp.connect(ctx.destination);
    } catch (e) { ctx = null; }
    return ctx;
  }

  var noiseBuf = null;
  function noise() {
    if (noiseBuf) return noiseBuf;
    var len = ctx.sampleRate * 0.6, b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    noiseBuf = b;
    return b;
  }

  function envelope(g, t0, d, peak, atk) {
    var a = atk == null ? Math.min(0.008, d / 3) : Math.min(atk, d * 0.9);
    if (a < 0.001) a = 0.001;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
  }

  function run(step, t) {
    var t0 = t + step.dl, g = ctx.createGain(), dest = master;
    if (step.lp) {
      var lpf = ctx.createBiquadFilter();
      lpf.type = 'lowpass';
      lpf.frequency.value = step.lp;
      lpf.Q.value = 0.7;
      lpf.connect(master);
      dest = lpf;
    }
    g.connect(dest);
    if (step.k === 'b') {
      BELL.forEach(function (p) {
        var o = ctx.createOscillator(), pg = ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(step.f * p[0], t0);
        envelope(pg, t0, step.d * p[2], step.g * p[1]);
        o.connect(pg);
        pg.connect(g);
        o.start(t0);
        o.stop(t0 + step.d * p[2] + 0.05);
      });
    } else if (step.k === 't') {
      var o = ctx.createOscillator();
      o.type = step.ty;
      o.frequency.setValueAtTime(step.f, t0);
      if (step.to) o.frequency.exponentialRampToValueAtTime(Math.max(step.to, 20), t0 + step.d);
      envelope(g, t0, step.d, step.g, step.atk);
      o.connect(g);
      o.start(t0);
      o.stop(t0 + step.d + 0.05);
    } else {
      var s = ctx.createBufferSource();
      s.buffer = noise();
      var f = ctx.createBiquadFilter();
      f.type = step.fl;
      f.Q.value = step.fl === 'bandpass' ? 2.2 : 0.8;
      f.frequency.setValueAtTime(step.f0, t0);
      if (step.f1 !== step.f0) f.frequency.exponentialRampToValueAtTime(Math.max(step.f1, 40), t0 + step.d);
      envelope(g, t0, step.d, step.g);
      s.connect(f);
      f.connect(g);
      s.start(t0, Math.random() * 0.3);
      s.stop(t0 + step.d + 0.05);
    }
  }

  function play(name) {
    if (!on) return;
    var kit = KITS[theme] || KITS.claude, steps = kit[name];
    if (!steps || !ensure()) return;
    var now = Date.now();
    if (lastAt[name] && now - lastAt[name] < 45) return;   // never machine-gun the same sound
    lastAt[name] = now;
    try {
      if (ctx.state === 'suspended') ctx.resume();
      var t = ctx.currentTime + 0.005;
      steps.forEach(function (s) { run(s, t); });
    } catch (e) { /* sound is optional */ }
  }

  window.KanbanSfx = {
    play: play,
    enabled: function () { return on; },
    setEnabled: function (v) {
      on = !!v;
      try { window.localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) { /* ignore */ }
    },
    setTheme: function (t) { theme = KITS[t] ? t : 'claude'; },
    themes: Object.keys(KITS)
  };
})();
