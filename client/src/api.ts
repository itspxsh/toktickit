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

export type TicketAttachmentStatus = "ACTIVE" | "REMOVED";

export interface TicketAttachmentView {
  id: number;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  status: TicketAttachmentStatus;
  removedAt: string | null;
  removalReason: string | null;
  createdAt: string;
}

export interface TicketDetailView extends TicketView {
  attachments: TicketAttachmentView[];
}

export type StaffTicketStatus = "NEW" | "OPEN" | "IN_PROGRESS" | "WAITING_FOR_REQUESTER" | "RESOLVED" | "CLOSED" | "REOPENED" | "CANCELLED";
export type StaffTicketPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export interface StaffPerson { id: number; name: string; role?: string }
export interface StaffComment { id: number; author: StaffPerson; body: string; createdAt: string }
export interface StaffTicketDetailView {
  ticketNumber: string;
  summary: string;
  description: string;
  ticketDate: string;
  requestedPriority: RequestedPriority;
  itPriority: StaffTicketPriority | null;
  currentStatus: StaffTicketStatus;
  appearsResolved: boolean;
  requester: { id: number; name: string; email: string };
  assignedStaff: { id: number; name: string } | null;
  attachments: TicketAttachmentView[];
  publicComments: StaffComment[];
  internalNotes: StaffComment[];
}

export type AdminUserRole = "REQUESTER" | "IT_STAFF" | "ADMIN";
export interface AdminUser {
  id: number;
  name: string;
  email: string;
  role: AdminUserRole;
  isActive: boolean;
  mustChangePassword: boolean;
  createdAt: string;
  updatedAt: string;
}
export interface AdminUserListQuery {
  q?: string;
  role?: AdminUserRole;
  isActive?: boolean;
  page?: number;
  pageSize?: number;
}
export interface AdminUserListResponse {
  items: AdminUser[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface CreateTicketResponse {
  data: TicketView;
  replayed: boolean;
}

export type TicketListSortBy = "updatedAt" | "createdAt" | "ticketNumber" | "requestedPriority";
export type TicketListSortOrder = "asc" | "desc";

export interface TicketListQuery {
  search?: string;
  categoryId?: number;
  relatedSystemId?: number;
  requestedPriority?: RequestedPriority;
  status?: "NEW";
  sortBy?: TicketListSortBy;
  sortOrder?: TicketListSortOrder;
  page?: number;
  pageSize?: 10 | 20 | 50;
}

export interface TicketListItem {
  id: number;
  ticketNumber: string;
  ticketDate: string;
  summary: string;
  requestedPriority: RequestedPriority;
  currentStatus: "NEW";
  createdAt: string;
  updatedAt: string;
  category: Category;
  relatedSystem: RelatedSystem;
}

export interface TicketListResponse {
  data: TicketListItem[];
  pagination: {
    page: number;
    pageSize: 10 | 20 | 50;
    totalItems: number;
    totalPages: number;
  };
}

export type StaffQueueStatus = "NEW" | "OPEN" | "IN_PROGRESS" | "WAITING_FOR_REQUESTER" | "RESOLVED" | "CLOSED" | "REOPENED" | "CANCELLED";
export type StaffQueuePriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export type StaffQueueAssignment = "unassigned" | "mine" | "assigned";
export type StaffQueueSort = "updatedAtDesc" | "priorityDesc" | "statusAsc";

export interface StaffQueueItem {
  ticketNumber: string;
  summary: string;
  requester: { id: number; name: string };
  itPriority: StaffQueuePriority | null;
  currentStatus: StaffQueueStatus;
  assignedStaff: { id: number; name: string } | null;
  updatedAt: string;
}

export interface StaffQueueQuery {
  q?: string;
  status?: StaffQueueStatus;
  itPriority?: StaffQueuePriority;
  assignment?: StaffQueueAssignment;
  sort?: StaffQueueSort;
  page?: number;
  pageSize?: number;
}

export interface StaffQueueResponse {
  items: StaffQueueItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
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

export type AuthRole = "REQUESTER" | "IT_STAFF" | "ADMIN";
export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: AuthRole;
  isActive: boolean;
  mustChangePassword: boolean;
}

let csrfToken: string | null = null;

function parseAuthUser(value: unknown): AuthUser | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  return typeof row.id === "number" && typeof row.name === "string" && typeof row.email === "string" &&
    (row.role === "REQUESTER" || row.role === "IT_STAFF" || row.role === "ADMIN") &&
    typeof row.isActive === "boolean" && typeof row.mustChangePassword === "boolean"
    ? row as unknown as AuthUser : null;
}

function errorFromBody(body: unknown, fallback: string, status: number): ApiError {
  const error = body && typeof body === "object" && "error" in body
    ? (body as { error?: { message?: unknown; fieldErrors?: unknown } }).error
    : undefined;
  const message = typeof error?.message === "string" ? error.message : fallback;
  const fields = error?.fieldErrors && typeof error.fieldErrors === "object"
    ? error.fieldErrors as Record<string, string> : undefined;
  return new ApiError(message, status, fields);
}

export async function fetchCurrentUser(signal?: AbortSignal): Promise<AuthUser | null> {
  const response = await fetch(`${API_URL}/api/auth/me`, { credentials: "include", signal });
  const body: unknown = await response.json().catch(() => null);
  if (response.status === 401) return null;
  if (!response.ok) throw errorFromBody(body, "Unable to load your session.", response.status);
  return parseAuthUser(body && typeof body === "object" && "user" in body ? (body as { user?: unknown }).user : body);
}

async function csrfHeaders(): Promise<HeadersInit> {
  if (!csrfToken) {
    const response = await fetch(`${API_URL}/api/auth/csrf`, { credentials: "include" });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) throw errorFromBody(body, "Unable to prepare this action.", response.status);
    csrfToken = body && typeof body === "object" && typeof (body as { csrfToken?: unknown }).csrfToken === "string"
      ? (body as { csrfToken: string }).csrfToken : null;
  }
  return csrfToken ? { "X-CSRF-Token": csrfToken } : {};
}

export async function loginUser(email: string, password: string): Promise<AuthUser> {
  const response = await fetch(`${API_URL}/api/auth/login`, {
    method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw errorFromBody(body, "Email or password is incorrect.", response.status);
  const user = parseAuthUser(body && typeof body === "object" && "user" in body ? (body as { user?: unknown }).user : null);
  if (!user) throw new ApiError("Unable to complete sign in.", response.status);
  return user;
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<AuthUser> {
  const response = await fetch(`${API_URL}/api/auth/change-password`, {
    method: "POST", credentials: "include", headers: { "Content-Type": "application/json", ...(await csrfHeaders()) },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw errorFromBody(body, "Unable to change password.", response.status);
  const user = parseAuthUser(body && typeof body === "object" && "user" in body ? (body as { user?: unknown }).user : null);
  if (!user) throw new ApiError("Unable to change password.", response.status);
  csrfToken = null;
  return user;
}

export async function logoutUser(): Promise<void> {
  const response = await fetch(`${API_URL}/api/auth/logout`, {
    method: "POST", credentials: "include", headers: await csrfHeaders(),
  });
  csrfToken = null;
  if (!response.ok) throw errorFromBody(await response.json().catch(() => null), "Unable to sign out.", response.status);
}

/** Load the authenticated IT Staff/Admin queue; actor identity comes from the server session. */
export async function fetchStaffTickets(
  query: StaffQueueQuery = {},
  signal?: AbortSignal,
): Promise<StaffQueueResponse> {
  const params = new URLSearchParams();
  if (query.q?.trim()) params.set("q", query.q.trim());
  if (query.status) params.set("status", query.status);
  if (query.itPriority) params.set("itPriority", query.itPriority);
  if (query.assignment) params.set("assignment", query.assignment);
  if (query.sort) params.set("sort", query.sort);
  if (query.page !== undefined) params.set("page", String(query.page));
  if (query.pageSize !== undefined) params.set("pageSize", String(query.pageSize));
  const suffix = params.toString() ? `?${params.toString()}` : "";
  const response = await fetch(`${API_URL}/api/staff/tickets${suffix}`, { credentials: "include", signal });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = readApiError(body, "Unable to load staff Tickets.");
    throw new ApiError(error.message, response.status, error.fieldErrors);
  }
  if (!body || typeof body !== "object" || !("items" in body) || !("page" in body) || !("pageSize" in body) || !("total" in body) || !("totalPages" in body)) {
    throw new Error("Unable to load staff Tickets.");
  }
  return body as StaffQueueResponse;
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

/** Load one requester-owned Ticket and read-only attachment metadata. */
export async function fetchTicketDetail(
  ticketNumber: string,
  requesterId: number,
  signal?: AbortSignal,
): Promise<TicketDetailView> {
  const response = await fetch(`${API_URL}/api/tickets/${encodeURIComponent(ticketNumber)}`, {
    headers: developmentRequesterHeaders(requesterId),
    signal,
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = body && typeof body === "object" && "error" in body
      ? (body as { error?: { message?: unknown; fieldErrors?: unknown } }).error
      : undefined;
    const fieldErrors = error?.fieldErrors && typeof error.fieldErrors === "object"
      ? error.fieldErrors as Record<string, string>
      : undefined;
    throw new ApiError(
      typeof error?.message === "string" ? error.message : "Unable to load Ticket.",
      response.status,
      fieldErrors,
    );
  }
  if (!body || typeof body !== "object" || !("data" in body)) {
    throw new Error("Unable to load Ticket.");
  }
  return (body as { data: TicketDetailView }).data;
}

function readApiError(body: unknown, fallback: string): { message: string; fieldErrors?: Record<string, string> } {
  const error = body && typeof body === "object" && "error" in body
    ? (body as { error?: { message?: unknown; fieldErrors?: unknown } }).error
    : undefined;
  const fieldErrors = error?.fieldErrors && typeof error.fieldErrors === "object"
    ? error.fieldErrors as Record<string, string>
    : undefined;
  return {
    message: typeof error?.message === "string" ? error.message : fallback,
    fieldErrors,
  };
}

async function staffMutation<T>(path: string, method: "POST" | "PATCH", body: unknown): Promise<T> {
  const csrfResponse = await fetch(`${API_URL}/api/auth/csrf`, { credentials: "include" });
  const csrfBody: unknown = await csrfResponse.json().catch(() => null);
  if (!csrfResponse.ok || !csrfBody || typeof csrfBody !== "object" || typeof (csrfBody as { csrfToken?: unknown }).csrfToken !== "string") {
    throw new ApiError("Unable to authorise this action.", csrfResponse.status || 401);
  }
  const response = await fetch(`${API_URL}${path}`, {
    method,
    credentials: "include",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": (csrfBody as { csrfToken: string }).csrfToken },
    body: JSON.stringify(body),
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = readApiError(payload, "Unable to update Ticket.");
    throw new ApiError(error.message, response.status, error.fieldErrors);
  }
  return payload as T;
}

async function adminMutation<T>(path: string, method: "POST" | "PATCH", body: unknown): Promise<T> {
  const csrfResponse = await fetch(`${API_URL}/api/auth/csrf`, { credentials: "include" });
  const csrfBody: unknown = await csrfResponse.json().catch(() => null);
  if (!csrfResponse.ok || !csrfBody || typeof csrfBody !== "object" || typeof (csrfBody as { csrfToken?: unknown }).csrfToken !== "string") {
    throw new ApiError("Unable to authorise this action.", csrfResponse.status || 401);
  }
  const response = await fetch(`${API_URL}${path}`, {
    method,
    credentials: "include",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": (csrfBody as { csrfToken: string }).csrfToken },
    body: JSON.stringify(body),
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsed = readApiError(payload, "Unable to update users.");
    throw new ApiError(parsed.message, response.status, parsed.fieldErrors);
  }
  return payload as T;
}

export async function fetchAdminUsers(query: AdminUserListQuery = {}, signal?: AbortSignal): Promise<AdminUserListResponse> {
  const params = new URLSearchParams();
  if (query.q?.trim()) params.set("q", query.q.trim());
  if (query.role) params.set("role", query.role);
  if (query.isActive !== undefined) params.set("isActive", String(query.isActive));
  if (query.page !== undefined) params.set("page", String(query.page));
  if (query.pageSize !== undefined) params.set("pageSize", String(query.pageSize));
  const suffix = params.toString() ? `?${params.toString()}` : "";
  const response = await fetch(`${API_URL}/api/admin/users${suffix}`, { credentials: "include", signal });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsed = readApiError(body, "Unable to load users.");
    throw new ApiError(parsed.message, response.status, parsed.fieldErrors);
  }
  if (!body || typeof body !== "object" || !("items" in body)) throw new Error("Unable to load users.");
  return body as AdminUserListResponse;
}

export function createAdminUser(payload: { name: string; email: string; role: AdminUserRole; initialPassword: string }) {
  return adminMutation<{ user: AdminUser }>("/api/admin/users", "POST", payload);
}

export function updateAdminUser(userId: number, payload: Partial<Pick<AdminUser, "name" | "email" | "role" | "isActive">>) {
  return adminMutation<{ user: AdminUser }>(`/api/admin/users/${userId}`, "PATCH", payload);
}

export function resetAdminUserPassword(userId: number, initialPassword: string) {
  return adminMutation<{ user: AdminUser }>(`/api/admin/users/${userId}/reset-initial-password`, "POST", { initialPassword });
}

export async function fetchStaffTicketDetail(ticketNumber: string, signal?: AbortSignal): Promise<StaffTicketDetailView> {
  const response = await fetch(`${API_URL}/api/staff/tickets/${encodeURIComponent(ticketNumber)}`, { credentials: "include", signal });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = readApiError(body, "Unable to load Ticket.");
    throw new ApiError(error.message, response.status, error.fieldErrors);
  }
  if (!body || typeof body !== "object" || !("ticket" in body)) throw new Error("Unable to load Ticket.");
  return (body as { ticket: StaffTicketDetailView }).ticket;
}

export function claimStaffTicket(ticketNumber: string) {
  return staffMutation<{ assignedStaff: { id: number; name: string } }>(`/api/staff/tickets/${encodeURIComponent(ticketNumber)}/claim`, "POST", {});
}

export function assignStaffTicket(ticketNumber: string, assignedStaffId: number) {
  return staffMutation<{ assignedStaff: { id: number; name: string } }>(`/api/staff/tickets/${encodeURIComponent(ticketNumber)}/assignment`, "PATCH", { assignedStaffId });
}

export function updateStaffPriority(ticketNumber: string, itPriority: StaffTicketPriority) {
  return staffMutation<{ itPriority: StaffTicketPriority }>(`/api/staff/tickets/${encodeURIComponent(ticketNumber)}/priority`, "PATCH", { itPriority });
}

export function updateStaffStatus(ticketNumber: string, currentStatus: StaffTicketStatus, confirm = false) {
  return staffMutation<{ currentStatus: StaffTicketStatus }>(`/api/staff/tickets/${encodeURIComponent(ticketNumber)}/status`, "PATCH", { currentStatus, confirm });
}

export function addStaffPublicComment(ticketNumber: string, body: string) {
  return staffMutation<{ comment: StaffComment }>(`/api/tickets/${encodeURIComponent(ticketNumber)}/comments`, "POST", { body });
}

export function addInternalNote(ticketNumber: string, body: string) {
  return staffMutation<{ note: StaffComment }>(`/api/staff/tickets/${encodeURIComponent(ticketNumber)}/internal-notes`, "POST", { body });
}

async function parseAttachmentResponse(response: Response, fallback: string): Promise<TicketAttachmentView> {
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = readApiError(body, fallback);
    throw new ApiError(error.message, response.status, error.fieldErrors);
  }
  if (!body || typeof body !== "object" || !("data" in body)) throw new Error(fallback);
  return (body as { data: TicketAttachmentView }).data;
}

/** Upload one file; callers may invoke this once per selected file. */
export async function uploadAttachment(
  ticketNumber: string,
  requesterId: number,
  file: File,
  signal?: AbortSignal,
): Promise<TicketAttachmentView> {
  const form = new FormData();
  form.append("file", file, file.name);
  const response = await fetch(`${API_URL}/api/tickets/${encodeURIComponent(ticketNumber)}/attachments`, {
    method: "POST",
    headers: developmentRequesterHeaders(requesterId),
    body: form,
    signal,
  });
  return parseAttachmentResponse(response, "Unable to upload Attachment.");
}

/** Fetch a private active attachment stream using the testing requester context. */
export async function downloadAttachment(
  ticketNumber: string,
  requesterId: number,
  attachmentId: number,
  signal?: AbortSignal,
): Promise<Blob> {
  const response = await fetch(
    `${API_URL}/api/tickets/${encodeURIComponent(ticketNumber)}/attachments/${attachmentId}/download`,
    { headers: developmentRequesterHeaders(requesterId), signal },
  );
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const error = readApiError(body, "Unable to download Attachment.");
    throw new ApiError(error.message, response.status, error.fieldErrors);
  }
  return response.blob();
}

/** Soft-remove one owned active attachment and preserve its metadata. */
export async function removeAttachment(
  ticketNumber: string,
  requesterId: number,
  attachmentId: number,
  reason: string,
  signal?: AbortSignal,
): Promise<TicketAttachmentView> {
  const response = await fetch(
    `${API_URL}/api/tickets/${encodeURIComponent(ticketNumber)}/attachments/${attachmentId}`,
    {
      method: "DELETE",
      headers: { "Content-Type": "application/json", ...developmentRequesterHeaders(requesterId) },
      body: JSON.stringify({ reason }),
      signal,
    },
  );
  return parseAttachmentResponse(response, "Unable to remove Attachment.");
}

/** Load the selected requester's Ticket list using only the testing context header. */
export async function fetchMyTickets(
  requesterId: number,
  query: TicketListQuery = {},
  signal?: AbortSignal,
): Promise<TicketListResponse> {
  const params = new URLSearchParams();
  if (query.search?.trim()) params.set("search", query.search.trim());
  if (query.categoryId !== undefined) params.set("categoryId", String(query.categoryId));
  if (query.relatedSystemId !== undefined) params.set("relatedSystemId", String(query.relatedSystemId));
  if (query.requestedPriority) params.set("requestedPriority", query.requestedPriority);
  if (query.status) params.set("status", query.status);
  if (query.sortBy) params.set("sortBy", query.sortBy);
  if (query.sortOrder) params.set("sortOrder", query.sortOrder);
  if (query.page !== undefined) params.set("page", String(query.page));
  if (query.pageSize !== undefined) params.set("pageSize", String(query.pageSize));

  const suffix = params.toString() ? `?${params.toString()}` : "";
  const response = await fetch(`${API_URL}/api/tickets${suffix}`, {
    headers: developmentRequesterHeaders(requesterId),
    signal,
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = body && typeof body === "object" && "error" in body
      ? (body as { error?: { message?: unknown; fieldErrors?: unknown } }).error
      : undefined;
    const fieldErrors = error?.fieldErrors && typeof error.fieldErrors === "object"
      ? error.fieldErrors as Record<string, string>
      : undefined;
    throw new ApiError(
      typeof error?.message === "string" ? error.message : "Unable to load My Tickets.",
      response.status,
      fieldErrors,
    );
  }
  if (!body || typeof body !== "object" || !("data" in body) || !("pagination" in body)) {
    throw new Error("Unable to load My Tickets.");
  }
  return body as TicketListResponse;
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
