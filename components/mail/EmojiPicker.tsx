"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { recentReactions } from "@/lib/recent-reactions";

const EMOJI_GROUPS: { label: string; emojis: string[] }[] = [
  {
    label: "Smileys",
    emojis: [
      "😀","😃","😄","😁","😆","😅","🤣","😂","🙂","🙃","😉","😊","😇","🥰","😍","🤩",
      "😘","😗","😚","😙","😋","😛","😜","🤪","😝","🤗","🤭","🤫","🤔","😐","😑","😶",
      "😏","😒","🙄","😬","😌","😔","😴","😷","🤒","🤕","🤢","🤮","🥵","🥶","🥴","😵",
      "🤯","🥳","😎","🤓","🧐","😕","🙁","😮","😯","😲","😳","🥺","😨","😰","😢","😭",
      "😱","😖","😞","😩","😫","🥱","😤","😡","😠","🤬","😈","💀","💩","👻","🤡",
    ],
  },
  {
    label: "Gestures & people",
    emojis: [
      "👍","👎","👌","🤌","🤏","✌️","🤞","🤟","🤘","🤙","👈","👉","👆","👇","☝️","👋",
      "🤚","🖐️","✋","🖖","👏","🙌","🤲","🙏","🤝","💪","🫶","👀","🧠","👶","🧒","🧑",
      "👨","👩","🧓","👮","🕵️","💂","👷","🤴","👸","🦸","🦹","🎅","🤶",
    ],
  },
  {
    label: "Hearts & symbols",
    emojis: [
      "❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔","❣️","💕","💞","💓","💗","💖",
      "💘","💝","💟","☮️","✝️","☪️","🔥","⭐","🌟","✨","⚡","💯","✅","❌","❓","❗",
      "💢","💥","💫","💦","🎵","🎶",
    ],
  },
  {
    label: "Animals & nature",
    emojis: [
      "🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐨","🐯","🦁","🐮","🐷","🐸","🐵","🐔",
      "🐧","🐦","🐤","🦆","🦅","🦉","🐺","🐴","🦄","🐝","🦋","🐌","🐞","🐢","🐍","🐙",
      "🦀","🐠","🐬","🐳","🌸","🌺","🌻","🌹","🌳","🌵","🍀","🌈","☀️","🌙","⛄","🌊",
    ],
  },
  {
    label: "Food & drink",
    emojis: [
      "🍏","🍎","🍐","🍊","🍋","🍌","🍉","🍇","🍓","🫐","🍒","🍑","🥭","🍍","🥥","🥝",
      "🍅","🥑","🌽","🌶️","🍕","🍔","🍟","🌭","🍿","🥨","🥐","🍞","🧀","🥚","🍳","🥞",
      "🥓","🍗","🌮","🌯","🥗","🍝","🍜","🍣","🍤","🍦","🍰","🎂","🍩","🍪","🍫","🍬",
      "🍭","☕","🍺","🍻","🍷","🥂","🍸",
    ],
  },
  {
    label: "Activities & objects",
    emojis: [
      "⚽","🏀","🏈","⚾","🎾","🏐","🎱","🏓","🏸","⛳","🎣","🥊","🎯","🎮","🎲","🧩",
      "🎸","🎹","🎺","🎷","🥁","🎤","🎧","🎬","🏆","🥇","🥈","🥉","🚗","✈️","🚀","🏝️",
      "🎁","🎈","🎉","🎊","🎄","💎","💰","💡","📱","💻","📷","🔑","🔒","⏰","📌","📎",
    ],
  },
];

export function EmojiPicker({
  onPick,
  onClose,
}: {
  onPick: (emoji: string) => void;
  onClose: () => void;
}) {
  // Recents shown as a top group. The localStorage read lives in
  // lib/recent-reactions; lazy init keeps it out of render and off an effect.
  const [recent] = useState<string[]>(() => recentReactions(16));
  const groups = recent.length
    ? [{ label: "Recently used", emojis: recent }, ...EMOJI_GROUPS]
    : EMOJI_GROUPS;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center"
      onClick={onClose}
    >
      <div
        className="flex max-h-[70vh] w-full max-w-md flex-col rounded-t-2xl border border-line-strong bg-surface-2 shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <span className="text-body font-bold text-ink-strong">Pick an emoji</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1 text-faint hover:text-ink"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {groups.map((g) => (
            <div key={g.label} className="mb-3">
              <div className="mb-1 px-1 text-micro font-semibold uppercase tracking-wide text-faint">
                {g.label}
              </div>
              <div className="grid grid-cols-8 gap-1">
                {g.emojis.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => onPick(e)}
                    className="rounded-lg p-1.5 text-[22px] leading-none hover:bg-surface-3"
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
