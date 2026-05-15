import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

export interface SettingsResponse {
  jira: {
    host: string;
    email: string;
    hasToken: boolean;
    autoTransitionDone: boolean;
  };
  terminal: {
    shellPath: string;
  };
  slack: {
    hasUserToken: boolean;
  };
}

const KEY = ["settings"] as const;

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

export function useSettings() {
  return useQuery<SettingsResponse>({
    queryKey: KEY,
    queryFn: () => api<SettingsResponse>("/api/settings"),
  });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      jira?: {
        host?: string;
        email?: string;
        apiToken?: string | null;
        autoTransitionDone?: boolean;
      };
      terminal?: {
        shellPath?: string;
      };
      slack?: {
        userToken?: string | null;
      };
    }) =>
      api<SettingsResponse>("/api/settings", {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    onSuccess: (data) => {
      qc.setQueryData(KEY, data);
    },
  });
}

export function useTestJira() {
  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/jira/test");
      return (await res.json()) as {
        ok: boolean;
        user?: string;
        error?: string;
      };
    },
  });
}

export function useTestSlack() {
  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/slack/test");
      return (await res.json()) as {
        ok: boolean;
        user?: string;
        team?: string;
        error?: string;
      };
    },
  });
}
