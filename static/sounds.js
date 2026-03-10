const SoundManager = {
  enabled: true,
  ctx: null,

  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
  },

  playTone(freq, startTime, duration, type = "sine", volume = 0.3) {
    if (!this.enabled || !this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.value = volume;
    // Add envelope to avoid clicks
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(volume, startTime + 0.01);
    gain.gain.linearRampToValueAtTime(0, startTime + duration - 0.01);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(startTime);
    osc.stop(startTime + duration);
  },

  // Correct answer: ascending two-note chime (C5 → E5)
  correct() {
    this.init();
    const t = this.ctx.currentTime;
    this.playTone(523.25, t, 0.15, "sine", 0.3);       // C5
    this.playTone(659.25, t + 0.15, 0.25, "sine", 0.3); // E5
  },

  // Wrong answer: low buzz
  wrong() {
    this.init();
    const t = this.ctx.currentTime;
    this.playTone(150, t, 0.4, "sawtooth", 0.2);
  },

  // Daily Double: dramatic rising sting
  dailyDouble() {
    this.init();
    const t = this.ctx.currentTime;
    this.playTone(261.63, t, 0.12, "triangle", 0.3);       // C4
    this.playTone(329.63, t + 0.12, 0.12, "triangle", 0.3); // E4
    this.playTone(392.00, t + 0.24, 0.12, "triangle", 0.3); // G4
    this.playTone(523.25, t + 0.36, 0.3, "triangle", 0.4);  // C5 (held longer)
  },

  // Final Jeopardy: repeating "think" pattern for 30 seconds
  // Returns a stop function
  finalTheme() {
    this.init();
    const t = this.ctx.currentTime;
    const notes = [
      // Simple repeating melody pattern
      { freq: 349.23, dur: 0.4 }, // F4
      { freq: 349.23, dur: 0.4 }, // F4
      { freq: 349.23, dur: 0.4 }, // F4
      { freq: 261.63, dur: 0.4 }, // C4
      { freq: 392.00, dur: 0.4 }, // G4
      { freq: 392.00, dur: 0.4 }, // G4
      { freq: 392.00, dur: 0.8 }, // G4 (held)
    ];

    const oscillators = [];
    let offset = 0;
    // Repeat pattern ~8 times to fill ~30 seconds
    for (let rep = 0; rep < 8; rep++) {
      for (const note of notes) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = note.freq;
        gain.gain.value = 0;
        gain.gain.setValueAtTime(0, t + offset);
        gain.gain.linearRampToValueAtTime(0.15, t + offset + 0.02);
        gain.gain.linearRampToValueAtTime(0, t + offset + note.dur - 0.02);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(t + offset);
        osc.stop(t + offset + note.dur);
        oscillators.push(osc);
        offset += note.dur;
      }
    }

    return function stop() {
      oscillators.forEach(o => { try { o.stop(); } catch(e) {} });
    };
  },

  // Game over fanfare: triumphant ascending arpeggio
  fanfare() {
    this.init();
    const t = this.ctx.currentTime;
    const notes = [
      { freq: 261.63, time: 0, dur: 0.15 },    // C4
      { freq: 329.63, time: 0.12, dur: 0.15 },  // E4
      { freq: 392.00, time: 0.24, dur: 0.15 },  // G4
      { freq: 523.25, time: 0.36, dur: 0.15 },  // C5
      { freq: 659.25, time: 0.48, dur: 0.15 },  // E5
      { freq: 783.99, time: 0.60, dur: 0.4 },   // G5 (held)
    ];
    notes.forEach(n => {
      this.playTone(n.freq, t + n.time, n.dur, "triangle", 0.3);
    });
  },
};
