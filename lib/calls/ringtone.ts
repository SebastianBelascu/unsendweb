/*
  Call ring tones, synthesized with Web Audio (no audio assets). A two-tone
  pulse on a cadence — `outgoing` is a quiet US-style ringback (1s on / 3s off,
  440+480 Hz); `incoming` is a louder, brighter ring (1s on / 1.4s off,
  480+620 Hz). Browsers may keep the AudioContext suspended for INCOMING rings
  (no user gesture) — we try to resume; if blocked there's simply no sound.
*/

let ctx: AudioContext | null = null;
let stopper: (() => void) | null = null;

export function playRingtone(kind: "incoming" | "outgoing"): void {
  stopRingtone();
  if (typeof window === "undefined") return;
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AC) return;
  try {
    ctx = new AC();
    void ctx.resume();
    const master = ctx.createGain();
    master.gain.value = 0.0001;
    master.connect(ctx.destination);

    const o1 = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    o1.type = "sine";
    o2.type = "sine";
    o1.frequency.value = kind === "incoming" ? 480 : 440;
    o2.frequency.value = kind === "incoming" ? 620 : 480;
    o1.connect(master);
    o2.connect(master);
    o1.start();
    o2.start();

    const peak = kind === "incoming" ? 0.14 : 0.08;
    const onDur = 1.0;
    const offDur = kind === "incoming" ? 1.4 : 3.0;
    let cancelled = false;

    const pulse = () => {
      if (cancelled || !ctx) return;
      const t = ctx.currentTime;
      const g = master.gain;
      g.cancelScheduledValues(t);
      g.setValueAtTime(0.0001, t);
      g.exponentialRampToValueAtTime(peak, t + 0.06);
      g.setValueAtTime(peak, t + onDur - 0.06);
      g.exponentialRampToValueAtTime(0.0001, t + onDur);
    };
    pulse();
    const interval = window.setInterval(pulse, (onDur + offDur) * 1000);

    stopper = () => {
      cancelled = true;
      window.clearInterval(interval);
      try {
        o1.stop();
        o2.stop();
      } catch {
        /* already stopped */
      }
      ctx?.close().catch(() => {});
      ctx = null;
    };
  } catch {
    ctx = null;
  }
}

export function stopRingtone(): void {
  if (stopper) {
    stopper();
    stopper = null;
  }
}
