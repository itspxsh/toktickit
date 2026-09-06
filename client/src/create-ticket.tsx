import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import {
  createTicket,
  createIdempotencyKey,
  fetchReferenceData,
  ApiError,
  type Category,
  type CreateTicketResponse,
  type RelatedSystem,
  type RequestedPriority,
} from "./api.ts";
import {
  Alert,
  EmptyState,
  ErrorState,
  FormField,
  LoadingState,
} from "./components/ui.tsx";
import { useRequesterContext } from "./requester.tsx";

const PRIORITIES: RequestedPriority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];
const EMPTY_VALUES = {
  categoryId: "",
  relatedSystemId: "",
  requestedPriority: "",
  summary: "",
  description: "",
};

type FormValues = typeof EMPTY_VALUES;
type FormErrors = Partial<Record<keyof FormValues | "submit", string>>;

function validate(values: FormValues): FormErrors {
  const errors: FormErrors = {};
  const summary = values.summary.trim();
  const description = values.description.trim();
  if (summary.length < 5 || summary.length > 120) errors.summary = "Summary must contain 5-120 characters.";
  if (description.length < 10 || description.length > 2_000) {
    errors.description = "Description must contain 10-2,000 characters.";
  }
  if (!values.categoryId) errors.categoryId = "Category is required.";
  if (!values.relatedSystemId) errors.relatedSystemId = "Related System is required.";
  if (!values.requestedPriority) errors.requestedPriority = "Requested Priority is required.";
  return errors;
}

export interface CreateTicketProps {
  onNavigate?: (path: string) => void;
}

export function CreateTicket({ onNavigate }: CreateTicketProps = {}) {
  const requesterContext = useRequesterContext();
  const { setCreateTicketDirty } = requesterContext;
  const [categories, setCategories] = useState<Category[]>([]);
  const [relatedSystems, setRelatedSystems] = useState<RelatedSystem[]>([]);
  const [referenceState, setReferenceState] = useState<"loading" | "success" | "error">("loading");
  const [referenceError, setReferenceError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [values, setValues] = useState<FormValues>(EMPTY_VALUES);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [created, setCreated] = useState<CreateTicketResponse | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(createIdempotencyKey);

  useEffect(() => {
    const controller = new AbortController();
    let ignore = false;
    setReferenceState("loading");
    setReferenceError(null);
    fetchReferenceData(controller.signal)
      .then((data) => {
        if (ignore) return;
        setCategories(data.categories);
        setRelatedSystems(data.relatedSystems);
        setReferenceState("success");
      })
      .catch((reason: unknown) => {
        if (ignore || (reason instanceof DOMException && reason.name === "AbortError")) return;
        setReferenceState("error");
        setReferenceError("Unable to load Categories and Related Systems.");
      });
    return () => {
      ignore = true;
      controller.abort();
    };
  }, [reloadToken]);

  const isDirty = useMemo(
    () => Object.values(values).some(Boolean) || attachments.length > 0,
    [attachments.length, values],
  );

  useEffect(() => {
    setCreateTicketDirty(isDirty && !created);
    return () => setCreateTicketDirty(false);
  }, [created, isDirty, setCreateTicketDirty]);

  function setField(field: keyof FormValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined, submit: undefined }));
  }

  function clearForm() {
    setValues(EMPTY_VALUES);
    setAttachments([]);
    setFileInputKey((key) => key + 1);
    setErrors({});
    setCreated(null);
    setIdempotencyKey(createIdempotencyKey());
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting || created || requesterContext.selectedRequesterId === null) return;
    const nextErrors = validate(values);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setIsSubmitting(true);
    try {
      const response = await createTicket(
        {
          categoryId: Number(values.categoryId),
          relatedSystemId: Number(values.relatedSystemId),
          summary: values.summary.trim(),
          requestedPriority: values.requestedPriority as RequestedPriority,
          description: values.description.trim(),
        },
        requesterContext.selectedRequesterId,
        idempotencyKey,
      );
      setCreated(response);
      setErrors({});
    } catch (reason: unknown) {
      if (reason instanceof ApiError && reason.fieldErrors) {
        setErrors({ ...reason.fieldErrors, submit: reason.message });
      } else {
        setErrors({ submit: reason instanceof Error ? reason.message : "Unable to create Ticket." });
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  if (created) {
    const ticketPath = `/tickets/${created.data.ticketNumber}`;
    return (
      <section className="card stack" aria-labelledby="create-ticket-success-title">
        <p className="eyebrow">Create Ticket</p>
        <h1 id="create-ticket-success-title">Ticket created successfully</h1>
        <Alert tone="success">
          Official Ticket Number: <strong>{created.data.ticketNumber}</strong>
        </Alert>
        <p>Your request is saved with status New. You can review it or create another request.</p>
        <div className="form-actions">
          <a className="button button--secondary" href={ticketPath} onClick={(event) => {
            if (onNavigate) {
              event.preventDefault();
              onNavigate(ticketPath);
            }
          }}>View Ticket</a>
          <a className="button button--tertiary" href="/tickets" onClick={(event) => {
            if (onNavigate) {
              event.preventDefault();
              onNavigate("/tickets");
            }
          }}>My Tickets</a>
          <button type="button" className="button button--primary" onClick={clearForm}>Create another</button>
        </div>
      </section>
    );
  }

  if (referenceState === "loading") {
    return (
      <section className="card stack" aria-labelledby="create-ticket-title">
        <h1 id="create-ticket-title">Create Ticket</h1>
        <LoadingState label="Loading Categories and Related Systems…" />
      </section>
    );
  }

  if (referenceState === "error") {
    return (
      <section className="card stack" aria-labelledby="create-ticket-title">
        <h1 id="create-ticket-title">Create Ticket</h1>
        <ErrorState onRetry={() => setReloadToken((token) => token + 1)}>
          {referenceError ?? "Unable to load Categories and Related Systems."}
        </ErrorState>
      </section>
    );
  }

  const controlsDisabled = categories.length === 0 || relatedSystems.length === 0;
  return (
    <section className="card stack" aria-labelledby="create-ticket-title">
      <div>
        <p className="eyebrow">Requester testing context</p>
        <h1 id="create-ticket-title">Create Ticket</h1>
        <p>Submit a requester-owned IT service request. Generated values are assigned after submission.</p>
      </div>

      {controlsDisabled && (
        <EmptyState>Active Categories and Related Systems are required before a Ticket can be submitted.</EmptyState>
      )}

      <form className="stack" onSubmit={handleSubmit} noValidate>
        <div className="create-ticket__system-info">
          <FormField id="ticket-number" label="Ticket Number" hint="Generated after submission">
            <input id="ticket-number" value="Generated after submission" readOnly aria-readonly="true" />
          </FormField>
          <FormField id="ticket-date" label="Ticket Date" hint="Generated after submission">
            <input id="ticket-date" value="Generated after submission" readOnly aria-readonly="true" />
          </FormField>
          <FormField id="ticket-requester" label="Requester" hint="Development Requester testing context">
            <input id="ticket-requester" value={requesterContext.selectedRequester?.name ?? "No requester selected"} readOnly aria-readonly="true" />
          </FormField>
        </div>

        <div className="create-ticket__grid">
          <FormField id="ticket-category" label="Category" required error={errors.categoryId}>
            <select id="ticket-category" value={values.categoryId} disabled={controlsDisabled} onChange={(event) => setField("categoryId", event.target.value)}>
              <option value="">Select a Category</option>
              {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </FormField>
          <FormField id="ticket-related-system" label="Related System" required error={errors.relatedSystemId}>
            <select id="ticket-related-system" value={values.relatedSystemId} disabled={controlsDisabled} onChange={(event) => setField("relatedSystemId", event.target.value)}>
              <option value="">Select a Related System</option>
              {relatedSystems.map((system) => <option key={system.id} value={system.id}>{system.name}</option>)}
            </select>
          </FormField>
          <FormField id="ticket-priority" label="Requested Priority" required error={errors.requestedPriority}>
            <select id="ticket-priority" value={values.requestedPriority} disabled={controlsDisabled} onChange={(event) => setField("requestedPriority", event.target.value)}>
              <option value="">Select a Requested Priority</option>
              {PRIORITIES.map((priority) => <option key={priority} value={priority}>{priority}</option>)}
            </select>
          </FormField>
        </div>

        <FormField id="ticket-summary" label="Summary" required error={errors.summary} hint="5-120 characters">
          <input id="ticket-summary" value={values.summary} maxLength={120} disabled={controlsDisabled} onChange={(event) => setField("summary", event.target.value)} />
        </FormField>
        <FormField id="ticket-description" label="Description" required error={errors.description} hint="10-2,000 characters">
          <textarea id="ticket-description" value={values.description} maxLength={2_000} disabled={controlsDisabled} onChange={(event) => setField("description", event.target.value)} />
        </FormField>
        <FormField id="ticket-attachments" label="Attachments" hint="JPG, PNG, WEBP, PDF; max 5 MiB; max 5 active">
          <input
            key={fileInputKey}
            id="ticket-attachments"
            type="file"
            multiple
            disabled={controlsDisabled}
            onChange={(event) => setAttachments(Array.from(event.target.files ?? []))}
          />
          {attachments.length > 0 && (
            <ul aria-label="Selected attachments">
              {attachments.map((file) => <li key={`${file.name}-${file.lastModified}`}>{file.name}</li>)}
            </ul>
          )}
        </FormField>

        {errors.submit && <Alert tone="error">{errors.submit}</Alert>}
        <div className="form-actions">
          <button type="button" className="button button--secondary" onClick={clearForm}>Clear</button>
          <button type="submit" className="button button--primary" disabled={controlsDisabled || isSubmitting || requesterContext.selectedRequesterId === null}>
            {isSubmitting ? "Creating…" : "Submit Ticket"}
          </button>
        </div>
      </form>
    </section>
  );
}

export default CreateTicket;
