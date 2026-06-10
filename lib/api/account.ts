import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiSend } from "./http";
import { fetchSession } from "./auth";

export function useSession() {
  return useQuery({ queryKey: ["session"], queryFn: fetchSession });
}

export interface ProfileUpdate {
  firstName?: string;
  lastName?: string;
  gender?: string;
  birthDate?: string;
}

export function useUpdateProfile() {
  return useMutation({
    mutationFn: (dto: ProfileUpdate) => apiSend("/users/me", "PATCH", dto),
  });
}

export interface PrivacyUpdate {
  showOnlineStatus?: boolean;
  showLastSeen?: boolean;
}

export function useUpdatePrivacy() {
  return useMutation({
    mutationFn: (dto: PrivacyUpdate) =>
      apiSend<{ showOnlineStatus: boolean; showLastSeen: boolean }>(
        "/users/me/privacy",
        "PATCH",
        dto,
      ),
  });
}

/** Read current privacy state (PATCH with no fields returns the saved values). */
export function usePrivacy() {
  return useQuery({
    queryKey: ["privacy"],
    queryFn: () =>
      apiSend<{ showOnlineStatus: boolean; showLastSeen: boolean }>(
        "/users/me/privacy",
        "PATCH",
        {},
      ),
  });
}

/** Step 1 of changing the phone number — send an SMS code to the new number. */
export function useSendPhoneCode() {
  return useMutation({
    mutationFn: (phone: string) =>
      apiSend<{ success?: boolean; message?: string }>(
        "/users/me/phone/send-code",
        "POST",
        { phone },
      ),
  });
}

/** Step 2 — verify the code and commit the new phone number. */
export function useVerifyPhoneChange() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ phone, code }: { phone: string; code: string }) =>
      apiSend("/users/me/phone/verify", "POST", { phone, code }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["session"] }),
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (body: { oldPassword: string; newPassword: string }) =>
      apiSend("/auth/change-password", "PATCH", body),
  });
}

export interface DeviceItem {
  deviceId: string;
  deviceName?: string | null;
  deviceType?: string | null;
  deviceOs?: string | null;
  deviceAppVersion?: string | null;
  createdAt?: string;
  lastActiveAt?: string;
  isCurrent: boolean;
}

export function useDevices() {
  return useQuery({
    queryKey: ["devices"],
    queryFn: async () => {
      const r = await apiGet<{ success: boolean; devices: DeviceItem[] }>(
        "/devices",
      );
      return r?.devices ?? [];
    },
  });
}

export function useDeviceActions() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["devices"] });
  const remove = useMutation({
    mutationFn: (deviceId: string) =>
      apiSend(`/devices/${deviceId}`, "DELETE"),
    onSuccess: invalidate,
  });
  const signOutOthers = useMutation({
    mutationFn: () => apiSend("/devices/my-other-devices", "DELETE"),
    onSuccess: invalidate,
  });
  return { remove, signOutOthers };
}
