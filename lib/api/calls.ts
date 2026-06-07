import { apiGet, apiSend } from "./http";

/*
  Calls REST surface (Agora). `/calls/start` both opens the call and mints the
  caller's Agora token; every joiner (caller AND receiver) POSTs it for the same
  topic to get a token minted for its own username. Signaling rides the socket
  (see lib/calls/useCallSignaling.ts). Backend: backend/src/calls/*.
*/

export type CallType = "voice" | "video";
export type CallStatus =
  | "active"
  | "started"
  | "missed"
  | "declined"
  | "ended"
  | "failed";

export interface CallContact {
  _id?: string;
  name?: string;
  address?: string;
}

export interface CallParticipant {
  userId?: string;
  username?: string;
  name?: string;
  address?: string;
  /** Username string here (NOT the numeric Agora uid). */
  uid?: string;
  agoraUid?: number;
  isOnHold?: boolean;
  isMuted?: boolean;
  isVideoOn?: boolean;
}

/** Response of POST /calls/start (ICallNotificationPayload + spread extras). */
export interface CallStartResponse {
  uuid: string;
  topicId: string;
  channelName: string;
  isVideoCall: boolean;
  agoraToken: string;
  /** Derive the numeric Agora UID from this (generateAgoraUid). */
  agoraUsername: string;
  caller: CallContact;
  participants: CallParticipant[];
  isGroup: boolean;
  groupName?: string;
  messageId?: string;
}

/** A Call document as returned by history / sync. */
export interface CallRecord {
  uuid: string;
  topicId: string;
  channelName: string;
  type: CallType;
  callerId: string;
  isGroup: boolean;
  subject?: string;
  status: CallStatus;
  participants: CallParticipant[];
  startedAt?: string;
  receivedAt?: string;
  duration: number;
  messageId?: string;
  createdAt?: string;
  updatedAt?: string;
  /** Enriched by /calls/history so the row can open the conversation. */
  threadId?: string;
}

export interface StartCallInput {
  topicId?: string;
  recipientUsername?: string;
  isVideoCall: boolean;
  /** DTO-required; server trusts the JWT, but we send it to satisfy validation. */
  callerId?: string;
}

export function startCall(input: StartCallInput): Promise<CallStartResponse> {
  return apiSend<CallStartResponse>("/calls/start", "POST", input);
}

export function markCallReceived(uuid: string): Promise<unknown> {
  return apiSend(`/calls/${encodeURIComponent(uuid)}/received`, "POST", {});
}

export function updateCallParticipant(
  uuid: string,
  username: string,
  dto: { isMuted?: boolean; isVideoOn?: boolean; isOnHold?: boolean },
): Promise<unknown> {
  return apiSend(
    `/calls/${encodeURIComponent(uuid)}/participant/${encodeURIComponent(username)}`,
    "PUT",
    dto,
  );
}

export async function getCallHistory(limit = 100): Promise<CallRecord[]> {
  const res = await apiGet<
    CallRecord[] | { data?: CallRecord[]; calls?: CallRecord[] }
  >(`/calls/history?limit=${limit}`);
  return Array.isArray(res) ? res : (res?.data ?? res?.calls ?? []);
}
