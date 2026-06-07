/*
  Deterministic avatar gradients + initials, ported verbatim from the React
  Native app (frontend/src/Screens/Authorized/components/Avatar/gradients.ts +
  utils.ts). Same palette, same hash, seeded by the contact's ADDRESS, so a
  given contact gets the exact same color on web as in the RN app. Single
  uppercase initial, matching AvatarItem.
*/

interface Gradient {
  colors: [string, string];
  fg: "black" | "white";
}

const PALETTE: Gradient[] = [
  { colors: ["#3CA55C", "#B5AC49"], fg: "black" },
  { colors: ["#4776E6", "#8E54E9"], fg: "white" },
  { colors: ["#085078", "#4776E6"], fg: "white" },
  { colors: ["#554023", "#c99846"], fg: "white" },
  { colors: ["#516b8b", "#056b3b"], fg: "white" },
  { colors: ["#3A6073", "#4776E6"], fg: "white" },
  { colors: ["#16222A", "#3A6073"], fg: "white" },
  { colors: ["#1F1C2C", "#928DAB"], fg: "white" },
  { colors: ["#614385", "#516395"], fg: "white" },
  { colors: ["#4776E6", "#8E54E9"], fg: "white" },
  { colors: ["#085078", "#4776E6"], fg: "white" },
  { colors: ["#2BC0E4", "#71B280"], fg: "black" },
  { colors: ["#134E5E", "#71B280"], fg: "white" },
  { colors: ["#5C258D", "#4389A2"], fg: "white" },
  { colors: ["#757F9A", "#134E5E"], fg: "white" },
  { colors: ["#232526", "#414345"], fg: "white" },
  { colors: ["#1CD8D2", "#3D7EAA"], fg: "black" },
  { colors: ["#3D7EAA", "#FFE47A"], fg: "black" },
  { colors: ["#283048", "#859398"], fg: "white" },
  { colors: ["#24C6DC", "#514A9D"], fg: "black" },
  { colors: ["#ED4264", "#4A569D"], fg: "white" },
  { colors: ["#ED4264", "#4A569D"], fg: "white" },
  { colors: ["#c04848", "#480048"], fg: "white" },
  { colors: ["#7474BF", "#348AC7"], fg: "white" },
  { colors: ["#EC6F66", "#F3A183"], fg: "black" },
  { colors: ["#5f2c82", "#49a09d"], fg: "white" },
  { colors: ["#6A9113", "#141517"], fg: "white" },
  { colors: ["#525252", "#3d72b4"], fg: "white" },
  { colors: ["#BA8B02", "#181818"], fg: "white" },
  { colors: ["#4b6cb7", "#182848"], fg: "white" },
  { colors: ["#304352", "#757519"], fg: "white" },
  { colors: ["#CCCCB2", "#757519"], fg: "black" },
  { colors: ["#2c3e50", "#3498db"], fg: "white" },
  { colors: ["#fc00ff", "#00dbde"], fg: "black" },
  { colors: ["#363795", "#e35d5b"], fg: "white" },
  { colors: ["#005C97", "#363795"], fg: "white" },
  { colors: ["#f46b45", "#eea849"], fg: "black" },
  { colors: ["#3498db", "#92FE9D"], fg: "black" },
  { colors: ["#673AB7", "#512DA8"], fg: "white" },
  { colors: ["#76b852", "#8DC26F"], fg: "black" },
  { colors: ["#4776E6", "#1F1C18"], fg: "white" },
  { colors: ["#FFB75E", "#ED8F03"], fg: "black" },
  { colors: ["#c2e59c", "#64b3f4"], fg: "black" },
  { colors: ["#403A3E", "#BE5869"], fg: "white" },
  { colors: ["#F15F79", "#F0CB35"], fg: "black" },
  { colors: ["#B24592", "#F15F79"], fg: "white" },
  { colors: ["#457fca", "#5691c8"], fg: "white" },
  { colors: ["#6a3093", "#a044ff"], fg: "white" },
  { colors: ["#fd746c", "#ff9068"], fg: "black" },
  { colors: ["#114357", "#F29492"], fg: "white" },
  { colors: ["#1e3c72", "#2a5298"], fg: "white" },
  { colors: ["#2F7336", "#AA3A38"], fg: "white" },
  { colors: ["#5614B0", "#DBD65C"], fg: "black" },
  { colors: ["#4DA0B0", "#D39D38"], fg: "black" },
  { colors: ["#5A3F37", "#2C7744"], fg: "white" },
  { colors: ["#2980b9", "#2c3e50"], fg: "white" },
  { colors: ["#0099F7", "#d04ed6"], fg: "black" },
  { colors: ["#834d9b", "#d04ed6"], fg: "white" },
  { colors: ["#4B79A1", "#283E51"], fg: "white" },
  { colors: ["#000000", "#434343"], fg: "white" },
  { colors: ["#4CA1AF", "#283E51"], fg: "white" },
  { colors: ["#BA5370", "red"], fg: "white" },
  { colors: ["#db36a4", "#3498db"], fg: "white" },
  { colors: ["#f7ff00", "#db36a4"], fg: "black" },
  { colors: ["#a80077", "#EF629F"], fg: "white" },
  { colors: ["#1D4350", "#A43931"], fg: "white" },
  { colors: ["#EECDA3", "#EF629F"], fg: "black" },
  { colors: ["#3498db", "#CB3066"], fg: "white" },
  { colors: ["#019df7", "#ff9068"], fg: "black" },
  { colors: ["#FF5F6D", "#FFC371"], fg: "black" },
  { colors: ["#2196f3", "#928DAB"], fg: "white" },
  { colors: ["#0B486B", "#928DAB"], fg: "white" },
  { colors: ["#3a7bd5", "#3a6073"], fg: "white" },
  { colors: ["#0B486B", "#F56217"], fg: "white" },
  { colors: ["#e96443", "#904e95"], fg: "white" },
  { colors: ["#2C3E50", "#4CA1AF"], fg: "white" },
  { colors: ["#2C3E50", "#FD746C"], fg: "white" },
  { colors: ["#019df7", "#243B55"], fg: "white" },
  { colors: ["#141E30", "#243B55"], fg: "white" },
  { colors: ["#42275a", "#734b6d"], fg: "white" },
  { colors: ["#000428", "#004e92"], fg: "white" },
  { colors: ["#56ab2f", "#a8e063"], fg: "black" },
  { colors: ["#019df7", "#19547b"], fg: "white" },
  { colors: ["#019df7", "#56ab2f"], fg: "black" },
  { colors: ["#64f38c", "#019df7"], fg: "black" },
  { colors: ["#3fada8", "#f8b500"], fg: "black" },
  { colors: ["#808080", "#3fada8"], fg: "white" },
  { colors: ["#ffd89b", "#19547b"], fg: "black" },
  { colors: ["#bdc3c7", "#2c3e50"], fg: "white" },
  { colors: ["#BE93C5", "#7BC6CC"], fg: "black" },
  { colors: ["#4ECDC4", "#556270"], fg: "white" },
  { colors: ["#3a6186", "#ef32d9"], fg: "white" },
  { colors: ["#ef32d9", "#333399"], fg: "white" },
  { colors: ["#de6161", "#2657eb"], fg: "white" },
  { colors: ["#ff00cc", "#333399"], fg: "white" },
  { colors: ["#FD746C", "#2C3E50"], fg: "white" },
  { colors: ["#ff7e5f", "#feb47b"], fg: "black" },
  { colors: ["#16222a", "#3a6073"], fg: "white" },
  { colors: ["#000428", "#004e92"], fg: "white" },
  { colors: ["#de6262", "#ffb88c"], fg: "black" },
  { colors: ["#ff0084", "#ffae00"], fg: "black" },
  { colors: ["#73d4c4", "#00ff0d"], fg: "black" },
  { colors: ["#9257fe", "#52fdbc"], fg: "black" },
  { colors: ["#472772", "#fe7bfe"], fg: "white" },
  { colors: ["#cfada7", "#4065a4"], fg: "black" },
  { colors: ["#7c3766", "#d46488"], fg: "white" },
  { colors: ["#77C045", "#40A629"], fg: "black" },
  { colors: ["#019df7", "#00c9a0"], fg: "black" },
  { colors: ["#7ed56f", "#28b485"], fg: "black" },
  { colors: ["#F54EA2", "#FF7676"], fg: "black" },
  { colors: ["#00c9a0", "#019df7"], fg: "black" },
  { colors: ["#004e92", "#753a88"], fg: "white" },
  { colors: ["#a18cd1", "#fbc2eb"], fg: "black" },
  { colors: ["#352208", "#E1BB80"], fg: "black" },
  { colors: ["#373F51", "#008DD5"], fg: "white" },
  { colors: ["#531CB3", "#008DD5"], fg: "white" },
  { colors: ["#531CB3", "#944BBB"], fg: "white" },
  { colors: ["#EE6C4D", "#F38D68"], fg: "black" },
  { colors: ["#944BBB", "#8B80F9"], fg: "white" },
];

// RN hash: hash = char + ((hash << 5) - hash), signed; index = abs(hash) % len.
function hashOf(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = s.charCodeAt(i) + ((hash << 5) - hash);
  }
  return hash;
}

function indexFor(seed: string): number {
  return Math.abs(hashOf(seed || "?")) % PALETTE.length;
}

/** `linear-gradient(...)` for an avatar, seeded by a stable key (the address). */
export function avatarGradient(seed: string): string {
  const p = PALETTE[indexFor(seed)];
  return `linear-gradient(135deg, ${p.colors[0]}, ${p.colors[1]})`;
}

/** Readable text color over the gradient ("black" | "white"). */
export function avatarForeground(seed: string): "black" | "white" {
  return PALETTE[indexFor(seed)].fg;
}

/** Single uppercase initial (matches RN AvatarItem). */
export function initials(name: string): string {
  const t = (name || "").trim();
  return (t[0] || "?").toUpperCase();
}
