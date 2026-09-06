import { useEffect, useRef, useState, type ChangeEvent } from "react";
import {
  ApiError,
  downloadAttachment,
  removeAttachment,
  uploadAttachment,
  type TicketAttachmentView,
} from "./api.ts";
import {
  ATTACHMENT_ACCEPT,
  validateAttachmentFile,
} from "./attachment-validation.ts";
import { Alert, ConfirmationDialog, FormField } from "./components/ui.tsx";

type UploadStatus = "uploading" | "success" | "error" | "invalid";

interface UploadItem {
  key: string;
  file: File;
  status: UploadStatus;
  message?: string;
}

let fileKeySequence = 0;

export interface AttachmentSectionProps {
  attachments: TicketAttachmentView[];
  onAttachmentsChange?: (attachments: TicketAttachmentView[]) => void;
  requesterId: number;
  ticketNumber: string;
}

function fileKey(file: File, index: number): string {
  fileKeySequence += 1;
  return `${file.name}-${file.size}-${file.lastModified}-${index}-${fileKeySequence}`;
}

function sortAttachments(attachments: TicketAttachmentView[]): TicketAttachmentView[] {
  return [...attachments].sort((left, right) => {
    const statusOrder = Number(left.status !== "ACTIVE") - Number(right.status !== "ACTIVE");
    if (statusOrder !== 0) return statusOrder;
    const createdOrder = left.createdAt.localeCompare(right.createdAt);
    return createdOrder !== 0 ? createdOrder : left.id - right.id;
  });
}

function displaySize(sizeBytes: number): string {
  return `${sizeBytes.toLocaleString()} bytes`;
}

function displayStatus(status: TicketAttachmentView["status"]): string {
  return status === "REMOVED" ? "Removed" : "Active";
}

/** Attachment controls for the requester-owned Ticket Detail view. */
export function AttachmentSection({
  attachments,
  onAttachmentsChange,
  requesterId,
  ticketNumber,
}: AttachmentSectionProps) {
  const [currentAttachments, setCurrentAttachments] = useState(() => sortAttachments(attachments));
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [pendingRemoval, setPendingRemoval] = useState<TicketAttachmentView | null>(null);
  const [removalReason, setRemovalReason] = useState("");
  const [actionError, setActionError] = useState("");
  const controllers = useRef(new Map<string, AbortController>());

  useEffect(() => {
    setCurrentAttachments(sortAttachments(attachments));
  }, [attachments]);

  useEffect(() => () => {
    controllers.current.forEach((controller) => controller.abort());
    controllers.current.clear();
  }, []);

  function updateAttachments(next: TicketAttachmentView[] | ((current: TicketAttachmentView[]) => TicketAttachmentView[])) {
    setCurrentAttachments((current) => {
      const value = sortAttachments(typeof next === "function" ? next(current) : next);
      onAttachmentsChange?.(value);
      return value;
    });
  }

  function updateUpload(key: string, update: Partial<UploadItem>) {
    setUploads((current) => current.map((item) => item.key === key ? { ...item, ...update } : item));
  }

  async function processUpload(item: UploadItem) {
    const controller = new AbortController();
    controllers.current.set(item.key, controller);
    updateUpload(item.key, { status: "uploading", message: undefined });
    try {
      const validationError = await validateAttachmentFile(item.file);
      if (validationError) {
        updateUpload(item.key, { status: "invalid", message: validationError });
        return;
      }
      const uploaded = await uploadAttachment(ticketNumber, requesterId, item.file, controller.signal);
      updateAttachments((current) => [...current, uploaded]);
      updateUpload(item.key, { status: "success", message: "Uploaded successfully." });
    } catch (reason: unknown) {
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      updateUpload(item.key, {
        status: "error",
        message: reason instanceof ApiError || reason instanceof Error ? reason.message : "Unable to upload Attachment.",
      });
    } finally {
      controllers.current.delete(item.key);
    }
  }

  function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    const items = files.map((file, index): UploadItem => ({ key: fileKey(file, index), file, status: "uploading" }));
    setUploads((current) => [...current, ...items]);
    event.target.value = "";
    void items.reduce(
      (promise, item) => promise.then(() => processUpload(item)),
      Promise.resolve(),
    );
  }

  function retryUpload(item: UploadItem) {
    void processUpload(item);
  }

  async function handleContentAction(attachment: TicketAttachmentView, mode: "preview" | "download") {
    setActionError("");
    const controller = new AbortController();
    controllers.current.set(`content-${attachment.id}`, controller);
    try {
      const blob = await downloadAttachment(ticketNumber, requesterId, attachment.id, controller.signal);
      const createObjectUrl = typeof URL.createObjectURL === "function" ? URL.createObjectURL.bind(URL) : null;
      if (!createObjectUrl) throw new Error("Attachment content is unavailable in this browser.");
      const url = createObjectUrl(blob);
      if (mode === "preview") {
        const preview = window.open(url, "_blank", "noopener,noreferrer");
        if (!preview) setActionError("Allow pop-ups to preview this Attachment.");
      } else {
        const link = document.createElement("a");
        link.href = url;
        link.download = attachment.originalName;
        link.click();
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (reason: unknown) {
      if (!(reason instanceof DOMException && reason.name === "AbortError")) {
        setActionError(reason instanceof Error ? reason.message : "Unable to load Attachment.");
      }
    } finally {
      controllers.current.delete(`content-${attachment.id}`);
    }
  }

  function requestRemoval(attachment: TicketAttachmentView) {
    setActionError("");
    setRemovalReason("");
    setPendingRemoval(attachment);
  }

  async function confirmRemoval() {
    if (!pendingRemoval || removalReason.trim().length < 5 || removalReason.trim().length > 250) return;
    const controller = new AbortController();
    controllers.current.set(`remove-${pendingRemoval.id}`, controller);
    try {
      const removed = await removeAttachment(
        ticketNumber,
        requesterId,
        pendingRemoval.id,
        removalReason.trim(),
        controller.signal,
      );
      updateAttachments((current) => current.map((item) => item.id === removed.id ? removed : item));
      setPendingRemoval(null);
      setRemovalReason("");
    } catch (reason: unknown) {
      if (!(reason instanceof DOMException && reason.name === "AbortError")) {
        setActionError(reason instanceof Error ? reason.message : "Unable to remove Attachment.");
      }
    } finally {
      controllers.current.delete(`remove-${pendingRemoval.id}`);
    }
  }

  return (
    <section className="ticket-detail__attachments" aria-labelledby="ticket-attachments-title">
      <div className="attachment-section__header">
        <div>
          <p className="eyebrow">Attachment lifecycle</p>
          <h2 id="ticket-attachments-title">Attachments</h2>
          <p>JPG, PNG, WEBP, or PDF; max 5 MiB per file; max 5 active.</p>
        </div>
        <FormField id="attachment-file" label="Add attachment" hint="Files are checked before private upload.">
          <input
            id="attachment-file"
            type="file"
            accept={ATTACHMENT_ACCEPT}
            multiple
            disabled={currentAttachments.filter((item) => item.status === "ACTIVE").length >= 5}
            onChange={handleFiles}
          />
        </FormField>
      </div>

      {uploads.length > 0 && (
        <ul className="attachment-upload-list" aria-label="Attachment upload results" aria-live="polite">
          {uploads.map((item) => (
            <li key={item.key}>
              <strong>{item.file.name}</strong>
              <span role={item.status === "invalid" || item.status === "error" ? "alert" : undefined}>
                {item.status === "uploading" && "Uploading…"}
                {item.status === "success" && (item.message ?? "Uploaded successfully.")}
                {(item.status === "invalid" || item.status === "error") && (item.message ?? "Unable to upload Attachment.")}
              </span>
              {(item.status === "invalid" || item.status === "error") && (
                <button type="button" className="button button--tertiary" onClick={() => retryUpload(item)}>
                  Retry upload {item.file.name}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {actionError && <Alert tone="error">{actionError}</Alert>}

      {currentAttachments.length === 0 ? (
        <p>No attachments.</p>
      ) : (
        <ul className="attachment-list" aria-label="Attachments">
          {currentAttachments.map((attachment) => (
            <li
              key={attachment.id}
              className={attachment.status === "REMOVED" ? "attachment-list__item--removed" : undefined}
            >
              <div className="ticket-detail__attachment-main">
                <strong>{attachment.originalName} — {displayStatus(attachment.status)}</strong>
                <span>{attachment.mimeType} · {displaySize(attachment.sizeBytes)}</span>
                {attachment.status === "REMOVED" && (
                  <span>Reason: {attachment.removalReason ?? "Not provided"}; removed {attachment.removedAt ?? "time unavailable"}</span>
                )}
              </div>
              {attachment.status === "ACTIVE" && (
                <div className="attachment-list__actions">
                  <button type="button" className="button button--tertiary" onClick={() => void handleContentAction(attachment, "preview")}>
                    Preview {attachment.originalName}
                  </button>
                  <button type="button" className="button button--tertiary" onClick={() => void handleContentAction(attachment, "download")}>
                    Download {attachment.originalName}
                  </button>
                  <button type="button" className="button button--destructive" onClick={() => requestRemoval(attachment)}>
                    Remove {attachment.originalName}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <ConfirmationDialog
        open={pendingRemoval !== null}
        title="Remove Attachment?"
        message={pendingRemoval ? `Remove ${pendingRemoval.originalName}? Its metadata will remain visible, but its content will be blocked.` : ""}
        onCancel={() => {
          setPendingRemoval(null);
          setRemovalReason("");
        }}
        onConfirm={() => void confirmRemoval()}
        confirmDisabled={removalReason.trim().length < 5 || removalReason.trim().length > 250}
      >
        <FormField id="removal-reason" label="Removal reason" required hint="5-250 characters">
          <textarea
            id="removal-reason"
            value={removalReason}
            maxLength={250}
            onChange={(event) => setRemovalReason(event.target.value)}
          />
        </FormField>
      </ConfirmationDialog>
    </section>
  );
}

export default AttachmentSection;
