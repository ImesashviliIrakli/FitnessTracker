import { useMemo } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api, ApiError } from "./api";
import type { Me } from "./types";
import { units } from "./units";

export const meKey = ["me"] as const;

export function useMe() {
  return useQuery({
    queryKey: meKey,
    queryFn: async () => {
      try {
        return await api.get<Me>("/api/auth/me");
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    staleTime: Infinity,
    retry: false, // guests shouldn't wait on retries; protected routes show a Try Again button
  });
}

export function useUnits() {
  const system = useMe().data?.unitSystem ?? "Metric";
  return useMemo(() => units(system), [system]);
}

/** Drop every cached query (including the offline API cache) so the next user never sees this one's data. */
export async function clearSession(qc: QueryClient) {
  qc.clear();
  qc.setQueryData(meKey, null);
  try {
    await globalThis.caches?.delete("api-get");
  } catch {
    // Cache Storage unavailable (private mode) — nothing to clear.
  }
}

export function useLogout() {
  const qc = useQueryClient();
  return async () => {
    try {
      await api.post("/api/auth/logout");
    } finally {
      await clearSession(qc);
    }
  };
}
