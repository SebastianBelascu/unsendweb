# Native → Web parity — full conversion plan

Goal: bring **unsendnext** (web) to feature parity with the **native iOS app**
(`nativeiosdraft-main`, Swift/SwiftUI). Backend is **immutable** — anything
needing a backend change is flagged Out-of-scope. Sourced from a full inventory
of both apps (native `Views/**` + `Services/**`, web `app/components/lib`).

Legend: ✅ done · 🟡 partial · ❌ missing · ⛔ backend-blocked / N-A on web

---

## 1. Gap analysis (by area)

### Chat / thread
| Native feature | Web | Priority |
|---|---|---|
| Message list, bubbles, day separators, optimistic send, receipts | ✅ | — |
| Reactions: quick row, chips, reactor sheet | ✅ (per-emoji tabs + recent-reactions: quick-row slot-0 swap & picker "Recently used") | — |
| Swipe-to-reply + quoted reply pill + reply bar | ✅ | — |
| Message info (sent/delivered/read-by) | ✅ | — |
| Edit / delete-for-me / delete-for-all / copy / forward / select | ✅ (15-min edit window + 24-h unsend gating, save-time re-check) | — |
| **@mentions** — picker overlay, rendering, `@everyone` | ❌ | **P1** |
| **Link previews** — composer bar + bubble card | ❌ | **P1** |
| Attachments grid (1/2/3+), inline video, voice waveform | ✅ | — |
| **Attachment fullscreen** — pinch-zoom, thumbnail strip, multi-image grid screen | 🟡 (lightbox only) | P2 |
| **Document tiles** (PDF/file preview, not just download) | 🟡 (download link only) | P3 |
| **Call bubbles** in chat (incoming/missed/answered + Join) | ❌ | P2 |
| Group sender row (avatar+name per run), info messages | ✅ | — |
| Typing indicator, presence, last-seen | ✅ | — |
| List virtualization for very long threads | 🟡 (verify perf) | P3 |

### Inbox / thread-list
| Native feature | Web | Priority |
|---|---|---|
| Thread rows, unread, pin/bookmark, attachment hint, online dot | ✅ | — |
| Filters: All / Unread / Groups / Bookmarks / Spam / Deleted | ✅ | — |
| **Promotional inbox** (separate Promo subscreen + bucket) | ❌ | P2 |
| Long-press **thread context menu** (pin/bookmark/spam/delete per-context) | ✅ (⋮ menu now touch-reachable: always-visible on mobile, hover on desktop) | — |
| Multi-select bulk actions (read/spam/delete/restore) | ✅ | — |
| Draft label / typing-in-row indicators | ✅ typing-in-row ("typing…" / "Name is typing…") + **"Draft:" preview** in the row when an unsent draft exists (native ThreadRowView), reactive via `useDraftStore` | — |
| **Mentions inbox** (@ messages where you're tagged) | ✅ (`@` header button → `MentionsSheet`, deep-links into the chat) | — |

### Contacts (Friends)
| Native feature | Web | Priority |
|---|---|---|
| **Activity sort** (online → last-seen → name) | ✅ (just shipped) | — |
| Chat-contacts list (Unsend users), online dot, last-seen | ✅ | — |
| **Email-friends + Call subscreens** (3-way filter) | ✅ (⋮ menu: Chat Friends / Email Friends / Call; call rows get audio+video CTAs via `placeCall`) | — |
| **Invite-to-Unsend** section (device contacts not on platform) | ⛔ (no device address book on web) | N-A |
| Device contact import (CNContactStore) | ⛔ | N-A |

### Search
| Native feature | Web | Priority |
|---|---|---|
| **Universal search** — People/Chats/Emails/Messages/Files/Calls, recent searches, quick actions | 🟡 (client-side filter of loaded threads only) | **P1** |

### Compose
| Native feature | Web | Priority |
|---|---|---|
| New / reply / forward, chat↔email toggle, To/Cc/Bcc/Subject | ✅ | — |
| "+" panel (recipients + cc/bcc + subject + attachments) | ✅ | — |
| Recipient autocomplete from contacts | ✅ | — |
| Voice messages + drafts (text) | ✅ | — |
| Drafts persisting recipients + attachments | ✅ text + cc/bcc/subject (native DraftEmailMeta, `drafts.ts`); ⛔ attachment blobs + replyTo (no web local blob store to rehydrate) | — |

### Email
| Native feature | Web | Priority |
|---|---|---|
| HTML viewer (sanitized, "See original"), header (participants + Subject) | ✅ | — |
| **Email labels row** (bcc / new / forwarded / private) | ✅ (below-bubble row, native order forwarded·bcc·edited·private joined with " • "; "new"/"before added" need fields the web doesn't carry) | — |
| Email message-info popup (to/cc/bcc + privacy) | 🟡 (in Message info sheet) | P3 |
| Promo favicon | ✅ (Google favicons; native uses Brandfetch) | — |

### Settings
| Native feature | Web | Priority |
|---|---|---|
| Profile edit (name/DOB), avatar upload (EXIF strip, resize) | ✅ | — |
| Change password | ✅ | — |
| **Change phone number** (SMS 2-step) | ❌ | P2 |
| **Privacy** (show online status / show last seen — exact native semantics) | 🟡 (toggles differ) | P2 |
| Devices / sessions list + log-out-others | ✅ | — |
| Account info / Security split screens | 🟡 (single screen) | P4 |
| Send feedback / invite a friend | 🟡 | P4 |

### Calls
| Native feature | Web | Priority |
|---|---|---|
| 1:1 + group audio/video, controls, history | ✅ | — |
| Screen share | ✅ | — |
| **Floating minimized call widget** | ✅ (`FloatingCallWidget` + store `minimized`/`joinedAt`; minimize button on `CallScreen`, tap pill to restore, duration survives) | — |
| Camera-invitation (video upgrade) sheet | ✅ (`CameraInvitationSheet` on `camera-on-invitation`, Accept→camera on, 30 s auto-dismiss) | — |
| Audio output picker | ⛔ (browser controls routing) | N-A |
| CallKit / VoIP background ring | ⛔ (no web push/VoIP) | N-A |

### Auth
| Native feature | Web | Priority |
|---|---|---|
| Login / signup (invite→form→SMS→success) / reset password | ✅ | — |
| Invite-code gate, country picker, DOB min-age | 🟡 (verify completeness) | P4 |

---

## 2. Phased plan

### P0 — quick wins (done / hours)
- ✅ **Contacts activity sort** (online → last-seen → name).
- Inbox **long-press context menu** (pin/bookmark/spam/delete) reusing existing thread mutations — small, high-perceived-value.

### P1 — chat depth + findability (highest value) — ✅ DONE
1. ✅ **@Mentions** — picker overlay on `@` (filtered participants + `@everyone` in groups/email), `@handle` insertion with kbd nav, mentions[] derived at send (backend resolves userId from handle), `@handle` chips in bubbles. Files: `MentionPicker.tsx`, `MentionText.tsx`, `lib/mentions.ts`, wired into `MessageComposer` + `ConversationView`.
2. ✅ **Link previews** — composer preview strip (dismissible) + bubble OG card; metadata via auth-gated/SSRF-guarded BFF `app/api/link-preview/route.ts` (backend stores only the `withUrlPreview` flag). Files: `lib/api/link-preview.ts`, `components/mail/LinkPreview.tsx`.
3. ✅ **Universal search — People + conversations** — a People section (your contacts + platform users, even with no thread) above the filtered conversation list. `lib/api/search.ts`, `components/shell/SearchPeople.tsx`. NOTE: full-text Messages/Files/Calls search is backend-blocked (no endpoint; native uses its local DB which web doesn't hold).

### P2 — inbox + chat polish — ✅ mostly DONE
4. ✅ **Promotional inbox** — a "Promotions" filter; promo threads split out of the primary inbox (`lib/inbox-view.ts` `promoVisible`, `ConversationListPane`).
5. ⏳ Attachment fullscreen zoom — deferred (lightbox open + nav done; pinch-zoom intentionally omitted earlier).
6. ✅ **Call bubbles in chat** — call info messages render as a tappable bubble (incoming/missed/answered/duration, icon) with call-back (`ConversationView` `CallBubble` + `parseCall`).
7. ✅ **Change phone number** (Settings) — SMS 2-step (`useSendPhoneCode`/`useVerifyPhoneChange`, `PhoneSection`).
8. ✅ **Privacy** — already aligned: `showOnlineStatus` + `showLastSeen` via `usePrivacy`/`useUpdatePrivacy`.

### P3 — done in this pass
- ✅ Reaction list **per-emoji tabs** (`ReactorSheet`).
- ✅ **Document tiles** (file icon box + name + size + download).
- 🟡 Email labels (forwarded/private already shown below the bubble; full bcc/new/forwarded chip row deferred).

### P3 — completeness
9. ✅ Reaction list per-emoji tabs + recent reactions (`recent-reactions.ts`, `EmojiPicker` recent group, native quick-row slot-0 swap).
10. ✅ Document tiles (file icon box + name + size + download).
11. ✅ Email labels row (`EmailLabelsRow` parity, below-bubble); email info popup still folded into the Message info sheet.
12. ✅ Edit window (15-min) + 24-h unsend gating (`lib/message-actions.ts`, save-time re-check with "Edit window expired" toast).
13. ✅ Drafts persisting recipients — text + cc/bcc/subject (native DraftEmailMeta) via `drafts.ts` `loadDraftMeta`/`saveDraftMeta`, rehydrated per thread in `MessageComposer`. ⛔ attachment blobs + replyTo not persisted (no web local blob store; replyTo is parent-owned and low value).
14. ✅ Contacts email/call subscreens — `ContactsPane` ⋮ menu (Chat Friends / Email Friends / Call), partitions the address book by domain; call rows place audio/video calls via `placeCall(recipientUsername…)`.
15. ✅ Floating minimized call widget + camera-invitation sheet — `FloatingCallWidget` (store `minimized` + `joinedAt`, minimize on `CallScreen`), `CameraInvitationSheet` (`camera-on-invitation` listener in `CallHost`, 30 s auto-dismiss).

### P4 — fit & finish
16. Split Settings into Account / Security / Privacy / Devices screens.
17. Send feedback / invite-a-friend.
18. Auth flow completeness audit (country picker, DOB, invite gate).

### ⛔ Out-of-scope (backend / platform)
- Device contact import + invite-to-Unsend (no web address book).
- CallKit / VoIP background ringing / web push (needs `pushPlatform:'web'`).
- Audio output device picker (browser owns routing).
- Anything requiring a backend schema/endpoint change.

---

## 2b. UX / interaction gaps (audit native vs web)

Web is strong on **bubble polish, theme system, optimistic send, gestures,
presence/typing, drafts**. The gaps are mostly animation/feedback/sound +
a couple of functional ones. By impact:

### Functional (not just cosmetic) — ✅ DONE
| Gap | Status |
|---|---|
| **Jump-to-quoted-message + highlight flash** — tap a reply quote → smooth-scrolls to the original + `bubble-flash` | ✅ `ConversationView` (`jumpToMessage`, `data-mid`), `globals.css` |
| **Load-older / back-scroll** — lazy-loads older history on scroll-up (`/before/:cursor`), anchors the viewport, survives polls (cache merge) | ✅ `lib/api/messages.ts` (`fetchOlderMessages` + merge), `ConversationView` |
| **Toasts** — `toast()` + `<Toaster/>`, 0.22s slide-fade; wired to copy / group rename·add·remove | ✅ `lib/toast.ts`, `components/ui/Toaster.tsx` |
| **Call ring sounds** — synthesized ringback (outgoing) + ring (incoming) via Web Audio | ✅ `lib/calls/ringtone.ts`, wired in `CallHost` |
| Message-list virtualization | ⏳ deferred (perf only; fine for normal threads) |

### Cosmetic polish — ✅ partial
| Item | Status |
|---|---|
| Reaction quick-react bar + action menu + mention picker pop-in | ✅ `pop-in` |
| Composer "+" panel + info/reactor sheets slide-in | ✅ `slide-up` |
| Thread-list skeleton loaders | ✅ pulse skeleton rows |
| Lightbox open animation / pinch-zoom / drag-dismiss | ⏳ (zoom intentionally removed earlier per user; open is instant) |
| Sync banner degraded states (offline/backlog/out-of-date) | ⏳ deferred (basic "Syncing…" pill exists) |

> Native theme values to match: bubble radius `min(h/2, 22)` continuous; reply
> swipe threshold 55pt/max 80pt (web uses 56pt — fine); date format Today /
> Yesterday / MMM dd / MMM dd, yyyy (web matches).

## 3. Notes
- The web is already strong on: chat core, attachments/media, calls, settings, realtime, compose. The **real gaps** are **mentions, link previews, universal search, promotional inbox, change-phone, and attachment-zoom/call-bubbles**.
- Recommend executing **P1 first** (mentions + link previews + search) — those are the most visible "this is missing vs native" items.
- Each phase ships independently; verify against the native file cited per row (e.g. mentions → `MentionPickerOverlay.swift`, link previews → `BubbleLinkPreviewCard.swift` / `ComposerLinkPreviewBar.swift`, search → `UniversalSearchView.swift`).
