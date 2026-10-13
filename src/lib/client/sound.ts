"use client";

/**
 * Alert chimes synthesised with Web Audio (no audio files, CSP-friendly).
 * Browsers only allow audio after a user gesture, so `unlockAudio` is wired
 * to the first tap; before that, alerts are silent but still visible.
 */
let ctx: AudioContext | null = null;

export function unlockAudio() {
  if (typeof window === "undefined") return;
  try {
    ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === "suspended") void ctx.resume();
  } catch {
    ctx = null;
  }
}

function tone(freq: number, start: number, duration: number, gain: number) {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  amp.gain.setValueAtTime(0, ctx.currentTime + start);
  amp.gain.linearRampToValueAtTime(gain, ctx.currentTime + start + 0.02);
  amp.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + duration);
  osc.connect(amp).connect(ctx.destination);
  osc.start(ctx.currentTime + start);
  osc.stop(ctx.currentTime + start + duration + 0.05);
}

export function playChime(kind: "info" | "urgent" = "info") {
  if (!ctx || ctx.state !== "running") return;
  if (kind === "urgent") {
    tone(880, 0, 0.18, 0.18);
    tone(660, 0.2, 0.18, 0.18);
    tone(880, 0.4, 0.28, 0.2);
  } else {
    tone(740, 0, 0.16, 0.12);
    tone(988, 0.14, 0.24, 0.12);
  }
  if ("vibrate" in navigator) navigator.vibrate?.(kind === "urgent" ? [120, 60, 120, 60, 200] : 80);
}
