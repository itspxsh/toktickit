import { useEffect, useState } from "react";
import {
  createAdminUser,
  fetchAdminUsers,
  resetAdminUserPassword,
  updateAdminUser,
  type AdminUser,
  type AdminUserRole,
  type AdminUserListResponse,
} from "./api.ts";
import { ConfirmationDialog, EmptyState, ErrorState, FormField, LoadingState, Pagination, StatusBadge } from "./components/ui.tsx";

const ROLES: AdminUserRole[] = ["REQUESTER", "IT_STAFF", "ADMIN"];

function roleLabel(role: AdminUserRole): string {
  return role === "IT_STAFF" ? "IT Staff" : role[0] + role.slice(1).toLowerCase();
}

function statusTone(active: boolean): "success" | "warning" {
  return active ? "success" : "warning";
}

interface UserManagementProps {
  pageSize?: number;
}

export function UserManagement({ pageSize = 20 }: UserManagementProps = {}) {
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<"" | AdminUserRole>("");
  const [activeFilter, setActiveFilter] = useState<"" | "true" | "false">("");
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [state, setState] = useState<"loading" | "success" | "error">("loading");
  const [result, setResult] = useState<AdminUserListResponse | null>(null);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editor, setEditor] = useState({ name: "", email: "", role: "REQUESTER" as AdminUserRole, isActive: true, initialPassword: "" });
  const [resetOpen, setResetOpen] = useState(false);
  const [resetPassword, setResetPassword] = useState("");
  const [activationTarget, setActivationTarget] = useState<{ id: number; name: string; nextActive: boolean } | null>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    let ignore = false;
    setState("loading");
    fetchAdminUsers({ q: search.trim() || undefined, role: role || undefined, isActive: activeFilter ? activeFilter === "true" : undefined, page, pageSize }, controller.signal)
      .then((data) => { if (!ignore) { setResult(data); setState("success"); } })
      .catch((reason: unknown) => { if (!ignore && !(reason instanceof DOMException && reason.name === "AbortError")) setState("error"); });
    return () => { ignore = true; controller.abort(); };
  }, [search, role, activeFilter, page, pageSize, reload]);

  function openCreate() {
    setEditing(null);
    setEditor({ name: "", email: "", role: "REQUESTER", isActive: true, initialPassword: "" });
    setEditorOpen(true);
    setNotice("");
  }

  function openEdit(user: AdminUser) {
    setEditing(user);
    setEditor({ name: user.name, email: user.email, role: user.role, isActive: user.isActive, initialPassword: "" });
    setEditorOpen(true);
    setNotice("");
  }

  async function save() {
    try {
      if (editing) await updateAdminUser(editing.id, { name: editor.name, email: editor.email, role: editor.role, isActive: editor.isActive });
      else await createAdminUser({ name: editor.name, email: editor.email, role: editor.role, initialPassword: editor.initialPassword });
      setEditorOpen(false);
      setNotice("User saved.");
      setReload((value) => value + 1);
    } catch (reason: unknown) { setNotice(reason instanceof Error ? reason.message : "Unable to save user."); }
  }

  async function resetPasswordForUser() {
    if (!editing) return;
    try {
      await resetAdminUserPassword(editing.id, resetPassword);
      setResetOpen(false);
      setResetPassword("");
      setNotice("Initial password reset; the user must change it on next login.");
      setReload((value) => value + 1);
    } catch (reason: unknown) { setNotice(reason instanceof Error ? reason.message : "Unable to reset initial password."); }
  }

  async function confirmActivationChange() {
    if (!activationTarget) return;
    try {
      await updateAdminUser(activationTarget.id, { isActive: activationTarget.nextActive });
      setEditor((current) => ({ ...current, isActive: activationTarget.nextActive }));
      setActivationTarget(null);
      setNotice(activationTarget.nextActive ? "User activated." : "User deactivated; active sessions were invalidated.");
      setReload((value) => value + 1);
    } catch (reason: unknown) {
      setNotice(reason instanceof Error ? reason.message : "Unable to change user status.");
    }
  }

  const users = result?.items ?? [];
  return (
    <section className="card stack" aria-labelledby="user-management-title">
      <div>
        <p className="eyebrow">Administrator workspace</p>
        <h1 id="user-management-title">User Management</h1>
        <p>Manage one role per user with server-authorized safeguards.</p>
      </div>
      <div className="my-tickets__toolbar" role="search" aria-label="User filters">
        <div className="my-tickets__toolbar-field my-tickets__toolbar-field--search"><label htmlFor="admin-user-search">Search users</label><input id="admin-user-search" value={search} maxLength={100} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></div>
        <div className="my-tickets__toolbar-field"><label htmlFor="admin-user-role">Role</label><select id="admin-user-role" value={role} onChange={(event) => { setRole(event.target.value as "" | AdminUserRole); setPage(1); }}><option value="">All roles</option>{ROLES.map((item) => <option key={item} value={item}>{roleLabel(item)}</option>)}</select></div>
        <div className="my-tickets__toolbar-field"><label htmlFor="admin-user-active">Status</label><select id="admin-user-active" value={activeFilter} onChange={(event) => { setActiveFilter(event.target.value as "" | "true" | "false"); setPage(1); }}><option value="">All statuses</option><option value="true">Active</option><option value="false">Inactive</option></select></div>
        <button type="button" className="button button--primary" onClick={openCreate}>Create User</button>
      </div>
      {notice && <p role="status" aria-live="polite">{notice}</p>}
      {state === "loading" && <LoadingState label="Loading users…" />}
      {state === "error" && <ErrorState onRetry={() => setReload((value) => value + 1)}>Unable to load users.</ErrorState>}
      {state === "success" && users.length === 0 && <EmptyState>No users match the current filters.</EmptyState>}
      {state === "success" && users.length > 0 && <>
        <div className="my-tickets__table-wrap" role="region" aria-label="User results" tabIndex={0}>
          <table className="my-tickets__table"><thead><tr><th scope="col">Name</th><th scope="col">Email</th><th scope="col">Role</th><th scope="col">Status</th><th scope="col">First login</th><th scope="col">Action</th></tr></thead>
            <tbody>{users.map((user) => <tr key={user.id}><td data-label="Name">{user.name}</td><td data-label="Email">{user.email}</td><td data-label="Role"><span aria-label={`Role: ${roleLabel(user.role)}`}>◆ {roleLabel(user.role)}</span></td><td data-label="Status"><StatusBadge label={user.isActive ? "Active" : "Inactive"} tone={statusTone(user.isActive)} /></td><td data-label="First login">{user.mustChangePassword ? "First login required" : "Password changed"}</td><td data-label="Action"><button type="button" className="button button--tertiary" aria-label={`Edit ${user.name}`} onClick={() => openEdit(user)}>Edit</button></td></tr>)}</tbody>
          </table>
        </div>
        {result && <Pagination currentPage={result.page} totalPages={result.totalPages} onPageChange={setPage} />}
      </>}

      {editorOpen && <section className="confirmation-dialog" role="dialog" aria-modal="true" aria-labelledby="admin-user-dialog-title" aria-describedby="admin-user-dialog-message">
        <h2 id="admin-user-dialog-title">{editing ? "Edit User" : "Create User"}</h2><p id="admin-user-dialog-message">Only safe identity fields are shown; passwords are never displayed.</p>
        <div className="stack"><FormField id="admin-user-name" label="Name" required><input id="admin-user-name" value={editor.name} onChange={(event) => setEditor((current) => ({ ...current, name: event.target.value }))} /></FormField><FormField id="admin-user-email" label="Email" required><input id="admin-user-email" type="email" value={editor.email} onChange={(event) => setEditor((current) => ({ ...current, email: event.target.value }))} /></FormField><FormField id="admin-user-role-select" label="Role" required><select id="admin-user-role-select" value={editor.role} onChange={(event) => setEditor((current) => ({ ...current, role: event.target.value as AdminUserRole }))}>{ROLES.map((item) => <option key={item} value={item}>{roleLabel(item)}</option>)}</select></FormField>{editing ? <FormField id="admin-user-active-toggle" label="Active"><input id="admin-user-active-toggle" type="checkbox" checked={editor.isActive} onChange={(event) => { if (event.target.checked !== editing.isActive) setActivationTarget({ id: editing.id, name: editing.name, nextActive: event.target.checked }); }} /></FormField> : <FormField id="admin-user-initial-password" label="Initial password" hint="12–128 characters" required><input id="admin-user-initial-password" type="password" value={editor.initialPassword} onChange={(event) => setEditor((current) => ({ ...current, initialPassword: event.target.value }))} /></FormField>}</div>
        <div className="confirmation-dialog__actions"><button type="button" className="button button--tertiary" onClick={() => setEditorOpen(false)}>Cancel</button>{editing && <button type="button" className="button button--secondary" onClick={() => setResetOpen(true)}>Reset initial password</button>}<button type="button" className="button button--primary" onClick={save}>{editing ? "Save changes" : "Create user"}</button></div>
      </section>}
      <ConfirmationDialog open={resetOpen} title="Reset initial password" message="This invalidates the user’s sessions and requires a password change at next login." confirmLabel="Reset initial password" confirmDisabled={resetPassword.trim().length < 12} onCancel={() => { setResetOpen(false); setResetPassword(""); }} onConfirm={resetPasswordForUser}><FormField id="admin-reset-password" label="New initial password" hint="12–128 characters" required><input id="admin-reset-password" type="password" value={resetPassword} onChange={(event) => setResetPassword(event.target.value)} /></FormField></ConfirmationDialog>
      <ConfirmationDialog open={activationTarget !== null} title={activationTarget?.nextActive ? "Activate user" : "Deactivate user"} message={activationTarget?.nextActive ? "Restore this user’s access?" : "Deactivate this user and invalidate active sessions?"} confirmLabel={activationTarget?.nextActive ? "Activate user" : "Deactivate user"} onCancel={() => setActivationTarget(null)} onConfirm={confirmActivationChange} />
    </section>
  );
}

export default UserManagement;
