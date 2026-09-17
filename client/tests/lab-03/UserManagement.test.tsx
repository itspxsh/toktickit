import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../../src/api.ts";
import { UserManagement } from "../../src/user-management.tsx";

const page: api.AdminUserListResponse = {
  items: [{ id: 12, name: "Example Requester", email: "requester@example.test", role: "REQUESTER", isActive: true, mustChangePassword: true, createdAt: "2026-09-15T07:00:00.000Z", updatedAt: "2026-09-15T07:00:00.000Z" }],
  page: 1, pageSize: 20, total: 1, totalPages: 1,
};

describe("L3-07 Admin User Management", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("T-UI-07 / AC-10 renders safe list filters and edit controls", async () => {
    const fetchSpy = vi.spyOn(api, "fetchAdminUsers").mockResolvedValue(page);
    render(<UserManagement />);
    expect(await screen.findByRole("heading", { name: "User Management" })).toBeInTheDocument();
    expect(screen.getByText("requester@example.test")).toBeInTheDocument();
    expect(screen.getByText("First login required")).toBeInTheDocument();
    expect(screen.queryByText(/passwordHash|initialPassword/i)).not.toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalled();
  });

  it("T-UI-07 / AC-11 exposes confirmation for activation and password reset", async () => {
    vi.spyOn(api, "fetchAdminUsers").mockResolvedValue(page);
    const user = userEvent.setup();
    render(<UserManagement />);
    await screen.findByText("Example Requester");
    await user.click(screen.getByRole("button", { name: /Edit Example Requester/i }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Reset initial password/i })).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: /Active/i }));
    expect(await screen.findByRole("alertdialog")).toHaveTextContent(/Deactivate this user/i);
  });

  it("T-UI-07 keeps server errors safe and offers retry", async () => {
    vi.spyOn(api, "fetchAdminUsers").mockRejectedValueOnce(new Error("database secret"));
    render(<UserManagement />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/Unable to load users/i);
    expect(screen.queryByText("database secret")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument());
  });
});
