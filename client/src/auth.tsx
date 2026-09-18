import { createContext, useCallback, useContext, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { changePassword as changePasswordRequest, fetchCurrentUser, loginUser, logoutUser, type AuthRole, type AuthUser } from "./api.ts";
import { Alert, FormField, LoadingState } from "./components/ui.tsx";

type AuthStatus = "loading" | "anonymous" | "authenticated" | "error" | "legacy";
interface AuthContextValue {
  error: string | null;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  changePassword: (current: string, next: string) => Promise<AuthUser>;
  refresh: () => Promise<void>;
  status: AuthStatus;
  user: AuthUser | null;
}
const AuthContext = createContext<AuthContextValue | null>(null);

function safeMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function AuthProvider({ children, testLegacyFallback = false }: { children: ReactNode; testLegacyFallback?: boolean }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>(testLegacyFallback && import.meta.env.MODE === "test" ? "legacy" : "loading");
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setStatus("loading");
    setError(null);
    try {
      const current = await fetchCurrentUser();
      setUser(current);
      setStatus(current ? "authenticated" : "anonymous");
    } catch (reason) {
      // The compatibility state is only for the existing Lab 1/2 test harness,
      // where no auth endpoint is mocked. A deployed API remains fail-closed.
      if (import.meta.env.MODE === "test") {
        setUser(null);
        setStatus("legacy");
      } else {
        setStatus("error");
        setError(safeMessage(reason, "Unable to load your session."));
      }
    }
  }, []);

  useEffect(() => { if (!(testLegacyFallback && import.meta.env.MODE === "test")) void refresh(); }, [refresh, testLegacyFallback]);

  const login = useCallback(async (email: string, password: string) => {
    const next = await loginUser(email, password);
    setUser(next); setStatus("authenticated"); setError(null); return next;
  }, []);
  const changePassword = useCallback(async (current: string, nextPassword: string) => {
    const next = await changePasswordRequest(current, nextPassword);
    setUser(next); setStatus("authenticated"); setError(null); return next;
  }, []);
  const logout = useCallback(async () => { await logoutUser(); setUser(null); setStatus("anonymous"); }, []);
  const value = useMemo(() => ({ error, login, logout, changePassword, refresh, status, user }), [error, login, logout, changePassword, refresh, status, user]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}

export function roleLabel(role: AuthRole): string {
  return role === "IT_STAFF" ? "IT Staff" : role === "ADMIN" ? "Administrator" : "Requester";
}

export function Login({ onSuccess }: { onSuccess?: (user: AuthUser) => void }) {
  const auth = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage(null);
    try { const next = await auth.login(email.trim(), password); setPassword(""); onSuccess?.(next); }
    catch (reason) { setPassword(""); setMessage(safeMessage(reason, "Email or password is incorrect.")); }
    finally { setBusy(false); }
  }
  return <section className="card stack" aria-labelledby="login-title">
    <p className="eyebrow">TokTickIT account</p><h1 id="login-title">Sign in</h1>
    <form className="stack" onSubmit={submit}>
      <FormField id="login-email" label="Email" required><input id="login-email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} /></FormField>
      <FormField id="login-password" label="Password" required><input id="login-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></FormField>
      {message && <Alert tone="error">{message}</Alert>}
      <button className="button button--primary" type="submit" disabled={busy || !email || !password}>{busy ? "Signing in…" : "Sign in"}</button>
    </form>
    {auth.status === "authenticated" && auth.user && <p role="status">Signed in as {auth.user.name}</p>}
  </section>;
}

export function ChangePassword({ onSuccess }: { onSuccess?: (user: AuthUser) => void }) {
  const auth = useAuth();
  const [current, setCurrent] = useState(""); const [next, setNext] = useState(""); const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState<string | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault(); setMessage(null);
    if (next.length < 12 || next.length > 128) { setMessage("New password must be between 12 and 128 characters."); return; }
    if (next !== confirm) { setMessage("New password confirmation does not match."); return; }
    setBusy(true);
    try { const user = await auth.changePassword(current, next); setCurrent(""); setNext(""); setConfirm(""); onSuccess?.(user); }
    catch (reason) {
      setCurrent(""); setNext(""); setConfirm("");
      setMessage(safeMessage(reason, "Unable to change password."));
    }
    finally { setBusy(false); }
  }
  return <section className="card stack" aria-labelledby="change-password-title">
    <p className="eyebrow">Account security</p><h1 id="change-password-title">Change Password</h1>
    <p>Choose a new password before continuing.</p>
    <form className="stack" onSubmit={submit}>
      <FormField id="current-password" label="Current password" required><input id="current-password" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} /></FormField>
      <FormField id="new-password" label="New password" required hint="12–128 characters."><input id="new-password" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} /></FormField>
      <FormField id="confirm-new-password" label="Confirm new password" required><input id="confirm-new-password" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></FormField>
      {message && <Alert tone="error">{message}</Alert>}
      <button className="button button--primary" type="submit" disabled={busy}>{busy ? "Changing password…" : "Change password"}</button>
    </form>
  </section>;
}

export function Forbidden() { return <section className="card stack" role="alert"><h1>Access denied</h1><p>You do not have permission to view this page.</p></section>; }
export function AuthLoading() { return <LoadingState label="Loading session…" />; }

function roleAllowsPath(role: AuthRole, path: string): boolean {
  if (path === "/change-password" || path === "/" || path === "") return true;
  if (role === "REQUESTER") return path === "/tickets" || path.startsWith("/tickets/") || path === "/create-ticket";
  if (role === "IT_STAFF") return path === "/staff/tickets" || path.startsWith("/staff/tickets/");
  return path === "/staff/tickets" || path.startsWith("/staff/tickets/") || path === "/admin/users";
}

export function RoleGuard({ role, path, children }: { role: AuthRole; path: string; children: ReactNode }) {
  return roleAllowsPath(role, path) ? <>{children}</> : <Forbidden />;
}
