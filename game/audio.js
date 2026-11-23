// Cinder Reef — audio.js
// All sound is synthesized live with WebAudio: no audio files, no network.
// One AudioSys instance owns the AudioContext; the game calls the small
// play* helpers. Everything is guarded so the game still runs when the
// browser blocks audio until the first user gesture.

(function (global) {
  'use strict';

  function AudioSys() {
    this.ctx = null;
    this.master = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOscA = null;
    this.sirenOscB = null;
    this.sirenGain = null;
    this.sirenOn = false;
    this.muted = false;
    this._sirenTimer = null;
    this._sirenHigh = false;
  }

  // Must be called from a user gesture at least once (title click / key).
  AudioSys.prototype.unlock = function () {
    try {
      if (!this.ctx) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.35;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch (e) { /* audio is optional; the game plays on silently */ }
  };

  AudioSys.prototype._tone = function (freq, dur, type, vol, slideTo) {
    if (!this.ctx || this.muted) return;
    try {
      var t = this.ctx.currentTime;
      var o = this.ctx.createOscillator();
      var g = this.ctx.createGain();
      o.type = type || 'square';
      o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
      g.gain.setValueAtTime(vol || 0.2, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g);
      g.connect(this.master);
      o.start(t);
      o.stop(t + dur + 0.02);
    } catch (e) {}
  };

  AudioSys.prototype._noise = function (dur, vol, filterFreq) {
    if (!this.ctx || this.muted) return;
    try {
      var t = this.ctx.currentTime;
      var len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
      var buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      var data = buf.getChannelData(0);
      for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      var src = this.ctx.createBufferSource();
      src.buffer = buf;
      var f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = filterFreq || 1200;
      var g = this.ctx.createGain();
      g.gain.setValueAtTime(vol || 0.3, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      src.connect(f);
      f.connect(g);
      g.connect(this.master);
      src.start(t);
    } catch (e) {}
  };

  AudioSys.prototype.shoot = function () {
    this._noise(0.12, 0.35, 2500);
    this._tone(180, 0.08, 'square', 0.12, 60);
  };

  AudioSys.prototype.explosion = function () {
    this._noise(0.7, 0.5, 500);
    this._tone(90, 0.6, 'sawtooth', 0.25, 30);
  };

  AudioSys.prototype.pickup = function () {
    this._tone(660, 0.09, 'sine', 0.22);
    var self = this;
    setTimeout(function () { self._tone(990, 0.12, 'sine', 0.22); }, 90);
  };

  AudioSys.prototype.cash = function () {
    var self = this;
    [523, 659, 784, 1047].forEach(function (f, i) {
      setTimeout(function () { self._tone(f, 0.14, 'triangle', 0.22); }, i * 80);
    });
  };

  AudioSys.prototype.fail = function () {
    this._tone(220, 0.25, 'sawtooth', 0.2, 110);
    var self = this;
    setTimeout(function () { self._tone(165, 0.4, 'sawtooth', 0.2, 82); }, 200);
  };

  AudioSys.prototype.busted = function () {
    var self = this;
    [392, 370, 349, 311].forEach(function (f, i) {
      setTimeout(function () { self._tone(f, 0.3, 'square', 0.16); }, i * 220);
    });
  };

  AudioSys.prototype.horn = function () {
    this._tone(370, 0.18, 'square', 0.12);
    var self = this;
    setTimeout(function () { self._tone(370, 0.18, 'square', 0.12); }, 220);
  };

  AudioSys.prototype.engineStart = function () {
    if (!this.ctx || this.engineOsc) return;
    try {
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.value = 50;
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0.0;
      var f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 400;
      this.engineOsc.connect(f);
      f.connect(this.engineGain);
      this.engineGain.connect(this.master);
      this.engineOsc.start();
    } catch (e) {}
  };

  AudioSys.prototype.engineSet = function (speed01, on) {
    if (!this.ctx || !this.engineOsc || !this.engineGain) return;
    try {
      var target = on ? 0.05 + speed01 * 0.09 : 0.0;
      this.engineGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.1);
      this.engineOsc.frequency.setTargetAtTime(45 + speed01 * 130, this.ctx.currentTime, 0.1);
    } catch (e) {}
  };

  AudioSys.prototype.sirenStart = function () {
    if (!this.ctx || this.sirenOn) return;
    try {
      this.sirenOn = true;
      this.sirenOscA = this.ctx.createOscillator();
      this.sirenOscA.type = 'sine';
      this.sirenOscA.frequency.value = 700;
      this.sirenGain = this.ctx.createGain();
      this.sirenGain.gain.value = 0.045;
      this.sirenOscA.connect(this.sirenGain);
      this.sirenGain.connect(this.master);
      this.sirenOscA.start();
      var self = this;
      this._sirenHigh = false;
      this._sirenTimer = setInterval(function () {
        if (!self.sirenOscA) return;
        self._sirenHigh = !self._sirenHigh;
        try { self.sirenOscA.frequency.setTargetAtTime(self._sirenHigh ? 950 : 700, self.ctx.currentTime, 0.05); } catch (e) {}
      }, 380);
    } catch (e) {}
  };

  AudioSys.prototype.sirenStop = function () {
    if (!this.sirenOn) return;
    this.sirenOn = false;
    if (this._sirenTimer) { clearInterval(this._sirenTimer); this._sirenTimer = null; }
    try {
      if (this.sirenOscA) { this.sirenOscA.stop(); this.sirenOscA.disconnect(); }
      if (this.sirenGain) this.sirenGain.disconnect();
    } catch (e) {}
    this.sirenOscA = null;
    this.sirenGain = null;
  };

  global.AudioSys = AudioSys;
})(typeof window !== 'undefined' ? window : globalThis);
