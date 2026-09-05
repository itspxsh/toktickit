import {
  cloneElement,
  isValidElement,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactElement,
  type ReactNode,
} from "react";

export const ZEN_GREEN_TOKENS = {
  "--color-primary": "#006B3C",
  "--color-secondary": "#0B7A46",
  "--color-pale": "#EAF6EF",
  "--color-background": "#F5F7F6",
  "--color-surface": "#FFFFFF",
  "--color-text": "#18352A",
  "--color-readonly": "#EEF2EF",
  "--color-error": "#A61B1B",
  "--color-warning": "#8A5A00",
  "--color-success": "#176B3A",
} as const;

export interface AppShellProps {
  activePath?: string;
  children?: ReactNode;
  requesterLabel?: string | null;
  onChangeRequester?: () => void;
}

export function AppShell({
  activePath = typeof window === "undefined" ? "/" : window.location.pathname,
  children,
  requesterLabel = null,
  onChangeRequester,
}: AppShellProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (typeof document === "undefined") return;
    Object.entries(ZEN_GREEN_TOKENS).forEach(([name, value]) => {
      document.documentElement.style.setProperty(name, value);
    });
  }, []);

  const isActive = (path: string) => activePath === path || activePath.startsWith(`${path}/`);

  return (
    <div className="app-shell">
      <header className="app-shell__header" role="banner">
        <div className="app-shell__header-inner">
          <a className="app-shell__brand" href="/" aria-label="TokTickIT home">
            <span className="app-shell__brand-name">TokTickIT</span>
            <span className="app-shell__brand-subtitle">IT Service Desk</span>
          </a>

          <button
            type="button"
            className="button button--secondary app-shell__menu-toggle"
            aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={menuOpen}
            aria-controls="primary-navigation"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span aria-hidden="true">☰</span>
            <span className="visually-hidden">Menu</span>
          </button>

          <nav
            id="primary-navigation"
            className={`app-shell__nav${menuOpen ? " app-shell__nav--open" : ""}`}
            aria-label="Primary navigation"
          >
            <a
              href="/tickets"
              className={`app-shell__nav-link${isActive("/tickets") ? " app-shell__nav-link--active" : ""}`}
              aria-current={isActive("/tickets") ? "page" : undefined}
              onClick={() => setMenuOpen(false)}
            >
              My Tickets
            </a>
            <a
              href="/create-ticket"
              className={`app-shell__nav-link${isActive("/create-ticket") ? " app-shell__nav-link--active" : ""}`}
              aria-current={isActive("/create-ticket") ? "page" : undefined}
              onClick={() => setMenuOpen(false)}
            >
              Create Ticket
            </a>
          </nav>

          <div className="app-shell__context" aria-label="Development Requester context">
            <span className="app-shell__requester">
              <span className="app-shell__context-label">Requester</span>
              <strong>{requesterLabel ?? "No requester selected"}</strong>
            </span>
            <span className="app-shell__testing-note">Testing context - not a login screen</span>
            <button type="button" className="button button--tertiary" onClick={onChangeRequester}>
              Change Requester
            </button>
          </div>
        </div>
      </header>

      <main className="app-shell__main" id="main-content">
        {children}
      </main>
    </div>
  );
}

export interface FormFieldProps {
  children: ReactNode;
  error?: string;
  hint?: string;
  id: string;
  label: string;
  required?: boolean;
}

export function FormField({ children, error, hint, id, label, required = false }: FormFieldProps) {
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null]
    .filter(Boolean)
    .join(" ");
  const enhancedChild = isValidElement(children)
    ? cloneElement(children as ReactElement<Record<string, unknown>>, {
        "aria-describedby": describedBy || undefined,
        "aria-invalid": error ? "true" : undefined,
        "aria-required": required ? "true" : undefined,
      })
    : children;

  return (
    <div className={`form-field${error ? " form-field--error" : ""}`}>
      <label className="form-field__label" htmlFor={id}>
        {label}
        {required && (
          <>
            <span className="required-marker" aria-hidden="true">
              *
            </span>
            <span className="visually-hidden"> (required)</span>
          </>
        )}
      </label>
      {hint && (
        <p className="form-field__hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
      {enhancedChild}
      {error && (
        <p className="form-field__error" id={`${id}-error`} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export interface StatusBadgeProps {
  label: string;
  tone?: "success" | "warning" | "error" | "neutral";
}

export function StatusBadge({ label, tone = "neutral" }: StatusBadgeProps) {
  return (
    <span
      className={`status-badge status-badge--${tone}`}
      data-tone={tone}
      role="status"
      aria-label={`Status: ${label}`}
    >
      <span aria-hidden="true">●</span> {label}
    </span>
  );
}

export function PriorityBadge({ label, tone = "neutral" }: StatusBadgeProps) {
  return <StatusBadge label={label} tone={tone} />;
}

export interface AlertProps {
  children: ReactNode;
  tone?: "info" | "success" | "warning" | "error";
}

export function Alert({ children, tone = "info" }: AlertProps) {
  return (
    <div className={`alert alert--${tone}`} role={tone === "error" ? "alert" : "status"}>
      {children}
    </div>
  );
}

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <p className="loading-state" role="status" aria-live="polite">
      <span aria-hidden="true">⌛</span> {label}
    </p>
  );
}

export function EmptyState({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <section className="state-card state-card--empty" aria-live="polite">
      <h2>Nothing here yet</h2>
      <p>{children}</p>
      {action}
    </section>
  );
}

export function ErrorState({ children, onRetry }: { children: ReactNode; onRetry?: () => void }) {
  return (
    <section className="state-card state-card--error" role="alert">
      <h2>Something went wrong</h2>
      <p>{children}</p>
      {onRetry && (
        <button type="button" className="button button--secondary" onClick={onRetry}>
          Retry
        </button>
      )}
    </section>
  );
}

export interface PaginationProps {
  currentPage: number;
  onPageChange: (page: number) => void;
  totalPages: number;
}

export function Pagination({ currentPage, onPageChange, totalPages }: PaginationProps) {
  return (
    <nav className="pagination" aria-label="Pagination">
      <button
        type="button"
        className="button button--tertiary"
        disabled={currentPage <= 1}
        onClick={() => onPageChange(currentPage - 1)}
      >
        Previous
      </button>
      <span aria-current="page">
        Page {currentPage} of {totalPages}
      </span>
      <button
        type="button"
        className="button button--tertiary"
        disabled={currentPage >= totalPages}
        onClick={() => onPageChange(currentPage + 1)}
      >
        Next
      </button>
    </nav>
  );
}

export interface AttachmentSummary {
  id: string;
  name: string;
  removed?: boolean;
  status?: string;
}

export function AttachmentList({ attachments }: { attachments: AttachmentSummary[] }) {
  return (
    <ul className="attachment-list" aria-label="Attachments">
      {attachments.map((attachment) => (
        <li key={attachment.id} className={attachment.removed ? "attachment-list__item--removed" : undefined}>
          <span>{attachment.name}</span>
          {attachment.removed ? <span>Removed</span> : attachment.status && <span>{attachment.status}</span>}
        </li>
      ))}
    </ul>
  );
}

export interface ConfirmationDialogProps {
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
  open: boolean;
  title: string;
}

export function ConfirmationDialog({
  message,
  onCancel,
  onConfirm,
  open,
  title,
}: ConfirmationDialogProps) {
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;

    const previousFocus = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLElement>("button")?.focus();

    return () => {
      previousFocus?.focus();
    };
  }, [open]);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
    }
  };

  if (!open) return null;

  return (
    <div className="dialog-backdrop" role="presentation">
      <section
        ref={dialogRef}
        className="confirmation-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirmation-title"
        onKeyDown={handleKeyDown}
      >
        <h2 id="confirmation-title">{title}</h2>
        <p>{message}</p>
        <div className="confirmation-dialog__actions">
          <button type="button" className="button button--tertiary" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="button button--destructive" onClick={onConfirm}>
            Confirm
          </button>
        </div>
      </section>
    </div>
  );
}
