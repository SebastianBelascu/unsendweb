import { useQuery } from "@tanstack/react-query";
import { apiGet } from "./http";

/*
  Contacts (address book). The backend is per-owner: GET /contacts returns the
  current user's saved contacts. See context/09-feature-contacts-profile-settings.md.
  The list/search Swagger types are loose; the runtime list wraps in
  `{ contacts: [...] }` with `{ name, address, phone }` rows (no `_id`).
*/

export interface Contact {
  name: string;
  address: string;
  phone?: string;
}

interface ContactsResponse {
  contacts?: Contact[];
}

/** The current user's full address book (GET /contacts). */
export function useContacts() {
  return useQuery({
    queryKey: ["contacts"],
    queryFn: async () => {
      const res = await apiGet<ContactsResponse>("/contacts");
      return res.contacts ?? [];
    },
    staleTime: 60_000,
  });
}
