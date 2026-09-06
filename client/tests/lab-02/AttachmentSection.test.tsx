import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../../src/api.ts";
import { AttachmentSection } from "../../src/attachment-section.tsx";

const ticketNumber = "TKT-2026-000042";
const requesterId = 1;
const png = new File([Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], "battery.png", {
  type: "image/png",
});
const active: api.TicketAttachmentView = {
  id: 101,
  originalName: "battery.png",
  mimeType: "image/png",
  sizeBytes: 8,
  status: "ACTIVE",
  removedAt: null,
  removalReason: null,
  createdAt: "2026-09-06T00:00:00.000Z",
};
const removed: api.TicketAttachmentView = {
  id: 102,
  originalName: "old-log.pdf",
  mimeType: "application/pdf",
  sizeBytes: 2048,
  status: "REMOVED",
  removedAt: "2026-09-06T01:00:00.000Z",
  removalReason: "Uploaded by mistake",
  createdAt: "2026-09-06T00:30:00.000Z",
};

function renderSection(onChange?: (attachments: api.TicketAttachmentView[]) => void) {
  return render(
    <AttachmentSection
      ticketNumber={ticketNumber}
      requesterId={requesterId}
      attachments={[active, removed]}
      onAttachmentsChange={onChange}
    />,
  );
}

describe("L2-08 AttachmentSection", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(api, "uploadAttachment").mockResolvedValue({
      ...active,
      id: 103,
      originalName: "new-evidence.png",
    });
    vi.spyOn(api, "downloadAttachment").mockResolvedValue(new Blob([png], { type: "image/png" }));
    vi.spyOn(api, "removeAttachment").mockResolvedValue({
      ...active,
      status: "REMOVED",
      removedAt: "2026-09-06T02:00:00.000Z",
      removalReason: "Uploaded the wrong screenshot.",
    });
  });

  it("UI-10 / AC-14: exposes labelled add, preview, download, and remove controls", async () => {
    const user = userEvent.setup();
    renderSection();

    expect(screen.getByLabelText("Add attachment")).toHaveAttribute("accept", ".jpg,.jpeg,.png,.webp,.pdf");
    expect(screen.getByRole("button", { name: "Preview battery.png" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download battery.png" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove battery.png" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /download old-log|preview old-log|remove old-log/i })).not.toBeInTheDocument();

    await user.upload(screen.getByLabelText("Add attachment"), png);
    expect(await screen.findByRole("button", { name: "Preview new-evidence.png" })).toBeInTheDocument();
    expect(api.uploadAttachment).toHaveBeenCalledWith(ticketNumber, requesterId, png, expect.any(AbortSignal));
  });

  it("UI-11 / AC-15-16: shows invalid files and requires a reason before soft removal", async () => {
    const user = userEvent.setup();
    renderSection();

    const invalid = new File(["not an image"], "malware.png", { type: "image/png" });
    await user.upload(screen.getByLabelText("Add attachment"), invalid);
    expect(await screen.findByText(/not supported|invalid/i)).toBeInTheDocument();
    expect(api.uploadAttachment).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Remove battery.png" }));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    const reason = screen.getByRole("textbox", { name: /Removal reason/ });
    expect(screen.getByRole("button", { name: "Confirm" })).toBeDisabled();
    await user.type(reason, "Uploaded the wrong screenshot.");
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(api.removeAttachment).toHaveBeenCalledWith(
      ticketNumber,
      requesterId,
      active.id,
      "Uploaded the wrong screenshot.",
      expect.any(AbortSignal),
    ));
    expect(screen.queryByRole("button", { name: "Preview battery.png" })).not.toBeInTheDocument();
    expect(screen.getByText(/battery\.png.*Removed/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove battery.png" })).not.toBeInTheDocument();
  });

  it("UI-12 / AC-17: reports each upload outcome and offers retry for a failed file", async () => {
    const user = userEvent.setup();
    const upload = vi.spyOn(api, "uploadAttachment")
      .mockResolvedValueOnce({ ...active, id: 103, originalName: "good.png" })
      .mockRejectedValueOnce(new api.ApiError("Unable to upload Attachment.", 500))
      .mockResolvedValueOnce({ ...active, id: 104, originalName: "retry.png" });
    renderSection();

    const good = new File([png], "good.png", { type: "image/png" });
    const retry = new File([png], "retry.png", { type: "image/png" });
    await user.upload(screen.getByLabelText("Add attachment"), [good, retry]);

    expect(await screen.findByRole("button", { name: "Preview good.png" })).toBeInTheDocument();
    expect(await screen.findByText(/Unable to upload Attachment/)).toBeInTheDocument();
    const retryButton = await screen.findByRole("button", { name: "Retry upload retry.png" });
    await user.click(retryButton);
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(3));
    expect(await screen.findByRole("button", { name: "Preview retry.png" })).toBeInTheDocument();
  });
});
