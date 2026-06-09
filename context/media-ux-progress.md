# Media & Chat-UX — progress / roadmap

Status of the media overhaul + chat-UX polish for `unsendnext` (web). Everything
is **client-side only** — the NestJS backend is unchanged; the existing
`AttachmentDto` (`id`, `url`, `title`, `type`, `size`, `placeholder`,
`thumbnail`, `orientation`) already supports all of it.

Legend: ✅ done · ⏳ remaining · 🔶 partial

## Media phases (the original 0–6 plan)

| # | Phase | Status | What it covers | Key files |
|---|-------|--------|----------------|-----------|
| 0 | Interop fix | ✅ | Web now sends `id` + blurhash `placeholder` + `orientation` so web-sent photos render correctly on phones (native keys its image cache on `id` → missing id made all web photos collide on `undefined-image`). | `lib/api/attachments.ts`, `components/mail/attachments.tsx` |
| 1 | Image processing | ✅ | Resize to ~1600px, re-encode (JPEG 0.75, PNG kept), EXIF fix, blurhash, size cap (100MB), error chips. | `lib/media/image.ts`, `lib/media/blurhash.ts` |
| 2 | Rich preview | ✅ | WhatsApp-style album grids (1 / 2 / 3 / 4+ with “+N”), progressive blur→fade-in load. | `components/mail/AttachmentGrid.tsx`, `components/mail/BlurImage.tsx` |
| 3 | Lightbox | ✅ | Fullscreen viewer: swipe / arrows / Esc, click-outside-to-close, download, thumbnail strip. | `components/mail/MediaLightbox.tsx` |
| 4 | Video | ✅ | Client poster frame + thumbnail upload, video tiles (poster + ▶) in the album grid, fullscreen player in the lightbox. No real transcode (browser limitation) — original uploaded, size-capped. | `lib/media/video.ts` + the grid/lightbox |
| 5 | Voice waveform | ✅ | WhatsApp-style player: play/pause + click-to-seek waveform that fills with playback. Real peaks decoded via Web Audio (cached per URL) with a deterministic pseudo-waveform fallback when fetch/CORS isn’t available; only one note plays at a time. | `components/mail/VoiceMessage.tsx` |
| 6 | Group + final | 🔶 | Per-sender avatar/name above bubbles render for **any** message (text/media/voice) in groups — confirmed in `MessageBubble`. **Cross-platform verification (web↔phone) is manual** — must be tested on a real device. | `components/mail/ConversationView.tsx` |

## Chat-UX polish (done alongside, beyond the media plan)

| Item | Status | Notes |
|------|--------|-------|
| Paste image/file from clipboard | ✅ | Both composers; routes through the same compress/blurhash pipeline. |
| Contacts section in the left rail | ✅ | `components/contacts/ContactsPane.tsx`; tap a contact → chat composer. |
| Swipe-to-reply (WhatsApp-style) | ✅ | `components/mail/SwipeToReply.tsx`; direction depends on sender; no text-selection during drag; clean directional snap-back. |
| Auto-focus composer on reply/edit | ✅ | Caret ready immediately. |
| Composer scrollbar only on overflow | ✅ | No scrollbar on empty/short input. |
| Instant conversation-list updates | ✅ | Handle the parallel socket **thread event** (`data.lastMessage`, no `headerId`) → reconcile the list cache instantly (new convo / preview / order / unread), mirroring native `useThreadUpdates`. `lib/realtime/threadCache.ts` (`applyThreadEvent`), `lib/socket/SocketProvider.tsx`. PLUS: `refreshOther` now also invalidates `["threads"]`/`["chatThreads"]` so the inbox converges to server truth ≤700ms after ANY event (reactions/edits/receipts/deletes), protected by `keepRecentlyBumped`. (Socket auth confirmed: backend reads `handshake.auth.token` first — `sockets.service.ts`.) |
| Group name on compose | ✅ | A chat with 2+ recipients shows a **Group name** field; sent as `subject` and re-applied via `updateChatName` on success so the name sticks. `components/mail/Composer.tsx`. |
| Group rename reflects instantly | ✅ | The header name was the static nav `title`; now an override (`renamedTitle`) updates the header the moment `GroupPanel` renames. `ConversationView.tsx` + `GroupPanel.tsx` (`onRenamed`). |
| Compose recipient suggestions | ✅ | Your **address book** is surfaced as instant autocomplete in the To/Cc/Bcc fields (name/username/phone match), plus `/users/search` as fallback. `components/mail/RecipientInput.tsx`. |
| Contacts = Unsend users only | ✅ | The Contacts rail filters out external email addresses (you can't chat them), matching the native chat-contact list. `components/contacts/ContactsPane.tsx`. |

## What’s actually left

- **Faza 6 — manual cross-platform test only**: send from web, confirm on the
  phone (photos/videos appear with thumbnail, voice notes play), and vice-versa.
  All code phases (0–5) are done.

> To see it running: `cd unsendnext && npm run dev`, then hard-refresh the browser (Ctrl+Shift+R) so stale code doesn’t mask new behavior.
