const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export interface Category {
  id: number;
  name: string;
}

export interface RelatedSystem {
  id: number;
  name: string;
}

export type RequestedPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

export interface CreateTicketPayload {
  categoryId: number;
  relatedSystemId: number;
  summary: string;
  requestedPriority: RequestedPriority;
  description: string;
}

export interface TicketView {
  id: number;
  ticketNumber: string;
  ticketDate: string;
  requester: Pick<Requester, "id" | "name">;
  category: Category;
  relatedSystem: RelatedSystem;
  summary: string;
  requestedPriority: RequestedPriority;
  description: string;
  itPriority: string | null;
  currentStatus: "NEW";
  createdAt: string;
  updatedAt: string;
}

export interface CreateTicketResponse {
  data: TicketView;
  replayed: boolean;
}

export class ApiError extends Error {
  readonly fieldErrors?: Record<string, string>;
  readonly status: number;

  constructor(message: string, status: number, fieldErrors?: Record<string, string>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
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

function isReferenceRow(value: unknown): value is Category {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === "number" && typeof row.name === "string";
}

/** Load active classification options for the Create Ticket form. */
export async function fetchReferenceData(signal?: AbortSignal): Promise<{
  categories: Category[];
  relatedSystems: RelatedSystem[];
}> {
  const [categoriesResponse, systemsResponse] = await Promise.all([
    fetch(`${API_URL}/api/categories`, { signal }),
    fetch(`${API_URL}/api/related-systems`, { signal }),
  ]);
  if (!categoriesResponse.ok || !systemsResponse.ok) {
    throw new Error("Unable to load Categories and Related Systems");
  }
  const [categories, relatedSystems]: [unknown, unknown] = await Promise.all([
    categoriesResponse.json(),
    systemsResponse.json(),
  ]);
  if (!Array.isArray(categories) || !Array.isArray(relatedSystems)) {
    throw new Error("Unable to load Categories and Related Systems");
  }
  return {
    categories: categories.filter(isReferenceRow),
    relatedSystems: relatedSystems.filter(isReferenceRow),
  };
}

export function createIdempotencyKey(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

/** Submit one requester-scoped Ticket using a stable idempotency key. */
export async function createTicket(
  payload: CreateTicketPayload,
  requesterId: number,
  idempotencyKey = createIdempotencyKey(),
): Promise<CreateTicketResponse> {
  const response = await fetch(`${API_URL}/api/tickets`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...developmentRequesterHeaders(requesterId),
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(payload),
  });

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = body && typeof body === "object" && "error" in body
      ? (body as { error?: { message?: unknown; fieldErrors?: unknown } }).error
      : undefined;
    const fieldErrors = error?.fieldErrors && typeof error.fieldErrors === "object"
      ? error.fieldErrors as Record<string, string>
      : undefined;
    const message =
      body && typeof body === "object" && "error" in body &&
      (body as { error?: { message?: unknown } }).error?.message;
    throw new ApiError(typeof message === "string" ? message : "Unable to create Ticket.", response.status, fieldErrors);
  }
  if (!body || typeof body !== "object" || !("data" in body)) {
    throw new Error("Unable to create Ticket.");
  }
  return body as CreateTicketResponse;
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
