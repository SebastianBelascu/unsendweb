/*
  Loose backend response shapes (the OpenAPI is loosely typed on the mail
  surface — see context/02 + context/07). Field names mirror the RN types in
  frontend/src/Types/{threads,message}. We map these into the view types in
  lib/types.ts via lib/api/mappers.ts.
*/

export interface BackendEmail {
  name?: string;
  address?: string;
  type?: "from" | "to" | "cc";
}

export interface BackendAttachment {
  id?: string;
  url?: string;
  title?: string; // filename incl. extension
  type?: string; // MIME type
  size?: number;
  /** blurhash for images, OR voice-note duration (seconds) as a string. */
  placeholder?: string;
  thumbnail?: string | null;
  orientation?: string | null;
}

export interface BackendReaction {
  id: string;
  reaction: string;
  byUser?: { userId?: string; name?: string; username?: string };
  createdAt?: string;
}

export interface BackendMessage {
  _id?: string;
  messageId: string;
  threadId?: string;
  headerId?: string;
  from?: BackendEmail;
  to?: BackendEmail[];
  cc?: BackendEmail[];
  html?: string | null;
  hasHtml?: boolean;
  text?: string;
  reactionText?: string;
  outbound?: boolean;
  seen?: boolean;
  replyTo?: string | null;
  reactions?: BackendReaction[];
  attachments?: BackendAttachment[];
  createdAt?: string;
  isInfoMessage?: boolean;
  isCall?: boolean;
}

export interface BackendThread {
  _id?: string;
  threadId: string;
  topicId: string;
  subject?: string;
  isSpam?: boolean;
  isPromotional?: boolean;
  isBookmarked?: boolean;
  isDeleted?: boolean;
  isChat?: boolean;
  isPinned?: boolean;
  isSilent?: boolean;
  isEmail?: boolean;
  isGroup?: boolean;
  favicon?: string | null;
  lastMessage?: BackendMessage;
  createdAt?: string;
  updatedAt?: string;
  isDraft?: boolean;
  participants?: BackendEmail[];
  chatName?: string;
}

export interface PagedResponse<T> {
  data: T[];
  totalCount: number;
  currentPage: number;
  totalPages: number;
}

export type ThreadsResponse = PagedResponse<BackendThread>;
export type MessagesResponse = PagedResponse<BackendMessage>;
