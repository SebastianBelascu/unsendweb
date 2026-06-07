// Public avatar URL: ${NEXT_PUBLIC_STORAGE_URL}<username>.jpeg?v=<version>.
// Returns undefined unless we know the user actually has an avatar (a version),
// so we never fire 404s for users without a photo.
const BASE = process.env.NEXT_PUBLIC_STORAGE_URL;

export function avatarUrl(
  username?: string,
  version?: number,
): string | undefined {
  if (!BASE || !username || !version) return undefined;
  return `${BASE}${username.toLowerCase()}.jpeg?v=${version}`;
}

/**
 * Avatar URL for the CURRENT user (own profile). The S3 path is deterministic,
 * so we always attempt it — if there's no photo it 404s and the <img> onError
 * falls back to the gradient. (For other users we stay version-gated to avoid
 * 404 storms across long lists; here it's a single, known-self request.)
 */
export function selfAvatarUrl(
  username?: string,
  version?: number,
): string | undefined {
  if (!BASE || !username) return undefined;
  const bust = version ? `?v=${version}` : "";
  return `${BASE}${username.toLowerCase()}.jpeg${bust}`;
}
