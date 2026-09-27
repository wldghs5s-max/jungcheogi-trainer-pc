function readLocalApiToken(): string {
  const env = import.meta.env as { VITE_LOCAL_API_TOKEN?: string };
  return String(env.VITE_LOCAL_API_TOKEN || "").trim();
}

export function withApiHeaders(init?: HeadersInit): Headers {
  const headers = new Headers(init);
  const token = readLocalApiToken();
  if (token && !headers.has("x-local-token")) {
    headers.set("x-local-token", token);
  }
  return headers;
}

export function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  return fetch(input, {
    ...init,
    headers: withApiHeaders(init?.headers),
  });
}
