import { useState } from "react";
import { checkSystem, type Category } from "./api.ts";
import {
  Alert,
  AppShell,
  AttachmentList,
  ConfirmationDialog,
  EmptyState,
  ErrorState,
  FormField,
  LoadingState,
  Pagination,
  PriorityBadge,
  StatusBadge,
  ZEN_GREEN_TOKENS,
} from "./components/ui.tsx";
import "./styles.css";

export {
  Alert,
  AppShell,
  AttachmentList,
  ConfirmationDialog,
  EmptyState,
  ErrorState,
  FormField,
  LoadingState,
  Pagination,
  PriorityBadge,
  StatusBadge,
  ZEN_GREEN_TOKENS,
};

type UiState = "idle" | "loading" | "success" | "error";

/**
 * Lab 1's health check remains available inside the new Lab 2 shell while the
 * requester and ticket routes are built in their dedicated Issues.
 */
export default function App() {
  const [state, setState] = useState<UiState>("idle");
  const [categories, setCategories] = useState<Category[]>([]);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleCheck() {
    setState("loading");
    setErrorMessage("");
    try {
      const result = await checkSystem();
      setCategories(result.categories);
      setState("success");
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Unable to connect to TokTickIT API");
      setState("error");
    }
  }

  const activePath = typeof window === "undefined" ? "/" : window.location.pathname;

  return (
    <AppShell activePath={activePath}>
      <section className="card stack" aria-labelledby="health-check-title">
        <div>
          <p className="eyebrow">Lab 1 compatibility check</p>
          <h1 id="health-check-title">TokTickIT service status</h1>
          <p>Use this diagnostic while the Lab 2 requester and ticket screens are being assembled.</p>
        </div>

        <button className="button button--primary" type="button" onClick={handleCheck} disabled={state === "loading"}>
          {state === "loading" ? "Loading…" : "Check System"}
        </button>

        {state === "loading" && <LoadingState label="loading" />}

        {state === "success" && (
          <div className="stack" aria-live="polite">
            <p>
              <strong>System Status:</strong> <StatusBadge label="Online" tone="success" />
            </p>
            {categories.length > 0 && (
              <div>
                <h2>Supported Request Categories</h2>
                <ul>
                  {categories.map((category) => (
                    <li key={category.id}>{category.name}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {state === "error" && (
          <div className="stack" aria-live="assertive">
            <p>
              <strong>System Status:</strong> <StatusBadge label="Offline" tone="error" />
            </p>
            <Alert tone="error">{errorMessage}</Alert>
          </div>
        )}
      </section>
    </AppShell>
  );
}
