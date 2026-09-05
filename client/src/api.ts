const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export interface Category {
  id: number;
  name: string;
}

export interface SystemStatus {
  online: boolean;
  categories: Category[];
}

export interface Requester {
  id: number;
  name: string;
  email: string;
}

/** The selector endpoint is intentionally unscoped: no requester exists yet. */
export async function fetchRequesters(signal?: AbortSignal): Promise<Requester[]> {
  const response = await fetch(`${API_URL}/api/requesters`, { signal });
  if (!response.ok) {
    throw new Error("Unable to load Development Requesters");
  }

  const payload: unknown = await response.json();
  if (!Array.isArray(payload)) {
    throw new Error("Unable to load Development Requesters");
  }

  return payload.filter(isRequester);
}

function isRequester(value: unknown): value is Requester {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === "number" && typeof row.name === "string" && typeof row.email === "string";
}

/** Headers for later requester-scoped calls; this is testing context only. */
export function developmentRequesterHeaders(requesterId: number): HeadersInit {
  return { "X-Development-Requester-Id": String(requesterId) };
}

// Issue 2 + Issue 4 — call the backend.
// Steps: fetch `${API_URL}/api/health`; if not ok, throw.
//        then fetch `${API_URL}/api/categories`; if not ok, throw.
//        return { online: true, categories }.
// Throwing on failure lets the UI show a single Offline/error state.
export async function checkSystem(): Promise<SystemStatus> {
  const healthRes = await fetch(`${API_URL}/api/health`);
  if (!healthRes.ok) {
    throw new Error("Unable to connect to TokTickIT API");
  }

  const categoriesRes = await fetch(`${API_URL}/api/categories`);
  if (!categoriesRes.ok) {
    throw new Error("Unable to connect to TokTickIT API");
  }

  const categories = await categoriesRes.json();
  return { online: true, categories };
}
