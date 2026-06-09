"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";

/*
  WhatsApp-style voice-note player: play/pause + a waveform that fills with
  playback and is click-to-seek. Real peaks are decoded from the audio (Web
  Audio, cached per URL); if that isn't possible (e.g. the object lacks CORS for
  fetch), we fall back to a deterministic pseudo-waveform so it still looks like
  a voice note. Playback itself always works via a hidden <audio>. Only one note
  plays at a time across the whole app.
*/

const BARS = 40;

// Only one voice note plays at once (like the native audio context).
let activeAudio: HTMLAudioElement | null = null;

/** Stable, natural-looking bars derived from a string — used until/if real
 *  peaks decode. Deterministic so a given note always looks the same. */
function pseudoPeaks(seed: string): number[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let x = h >>> 0;
  const peaks: number[] = [];
  for (let i = 0; i < BARS; i++) {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    peaks.push(0.25 + (x / 0xffffffff) * 0.75);
  }
  return peaks;
}

const peakCache = new Map<string, number[]>();

async function decodePeaks(url: string): Promise<number[] | null> {
  if (peakCache.has(url)) return peakCache.get(url) ?? null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const raw = await res.arrayBuffer();
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return null;
    const ctx = new AC();
    const audio = await ctx.decodeAudioData(raw);
    ctx.close?.();
    const data = audio.getChannelData(0);
    const block = Math.floor(data.length / BARS) || 1;
    const peaks: number[] = [];
    let max = 0;
    for (let i = 0; i < BARS; i++) {
      let sum = 0;
      for (let j = 0; j < block; j++) {
        const v = data[i * block + j] || 0;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / block);
      peaks.push(rms);
      if (rms > max) max = rms;
    }
    const norm = peaks.map((p) => (max > 0 ? Math.max(0.08, p / max) : 0.08));
    peakCache.set(url, norm);
    return norm;
  } catch {
    return null;
  }
}

function fmt(s: number): string {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec < 10 ? "0" : ""}${sec}`;
}

export function VoiceMessage({
  url,
  durationSec,
  isOwn,
  onPlay,
}: {
  url?: string;
  durationSec?: number;
  isOwn?: boolean;
  onPlay?: () => void;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0); // 0..1
  const [dur, setDur] = useState(durationSec ?? 0);
  const [peaks, setPeaks] = useState<number[]>(() => pseudoPeaks(url ?? ""));

  useEffect(() => {
    let alive = true;
    if (url) decodePeaks(url).then((p) => p && alive && setPeaks(p));
    return () => {
      alive = false;
    };
  }, [url]);

  function toggle() {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) {
      if (activeAudio && activeAudio !== a) activeAudio.pause();
      activeAudio = a;
      void a.play();
      onPlay?.();
    } else {
      a.pause();
    }
  }

  function seek(e: React.MouseEvent<HTMLDivElement>) {
    const a = audioRef.current;
    if (!a) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const d = a.duration || dur;
    if (d) a.currentTime = ratio * d;
  }

  const filled = Math.round(progress * BARS);
  const shown = playing || progress > 0 ? progress * dur : dur;

  return (
    <div className="flex items-center gap-2.5 py-0.5">
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "Pause" : "Play"}
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
          isOwn ? "bg-white/20 text-white" : "bg-surface-2 text-ink",
        )}
      >
        {playing ? (
          <Pause className="h-4 w-4" fill="currentColor" />
        ) : (
          <Play className="h-4 w-4 translate-x-[1px]" fill="currentColor" />
        )}
      </button>

      <div
        onClick={seek}
        className="flex h-7 cursor-pointer items-center gap-[2px]"
      >
        {peaks.map((p, i) => (
          <span
            key={i}
            style={{ height: `${Math.max(12, Math.round(p * 100))}%` }}
            className={cn(
              "w-[3px] shrink-0 rounded-full transition-colors",
              i < filled
                ? isOwn
                  ? "bg-white"
                  : "bg-accent"
                : isOwn
                  ? "bg-white/35"
                  : "bg-faint/50",
            )}
          />
        ))}
      </div>

      <span
        className={cn(
          "shrink-0 text-micro tabular-nums",
          isOwn ? "text-white/80" : "text-faint",
        )}
      >
        {fmt(shown)}
      </span>

      <audio
        ref={audioRef}
        src={url}
        preload="metadata"
        className="hidden"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(e) => {
          const a = e.currentTarget;
          setProgress(a.duration ? a.currentTime / a.duration : 0);
        }}
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (isFinite(d) && d > 0) setDur(d);
        }}
        onEnded={() => {
          setPlaying(false);
          setProgress(0);
          if (activeAudio === audioRef.current) activeAudio = null;
        }}
      />
    </div>
  );
}
