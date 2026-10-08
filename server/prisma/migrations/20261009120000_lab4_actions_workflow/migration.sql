-- Lab 4 additive action/workflow foundation. Preserve all Lab 1-3 rows and sequences.
BEGIN;

CREATE TYPE "ActionState" AS ENUM ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
CREATE TYPE "ActionRevisionKind" AS ENUM ('CREATE', 'EDIT', 'ASSIGN', 'START', 'COMPLETE', 'CANCEL');

ALTER TABLE "Ticket"
  ADD COLUMN "workflowVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "resolvedAt" TIMESTAMPTZ(3),
  ADD CONSTRAINT "Ticket_workflowVersion_positive_check" CHECK ("workflowVersion" > 0);

CREATE TABLE "ActionTaken" (
  "id" SERIAL NOT NULL,
  "ticketId" INTEGER NOT NULL,
  "clientRequestId" UUID NOT NULL,
  "payloadFingerprint" TEXT NOT NULL,
  "createdById" INTEGER NOT NULL,
  "assigneeId" INTEGER NOT NULL,
  "performedById" INTEGER,
  "description" TEXT NOT NULL,
  "result" TEXT NOT NULL DEFAULT '',
  "followUpRequired" BOOLEAN NOT NULL DEFAULT false,
  "followUpNote" TEXT NOT NULL DEFAULT '',
  "attachmentNotes" TEXT NOT NULL DEFAULT '',
  "state" "ActionState" NOT NULL DEFAULT 'PLANNED',
  "cancellationReason" TEXT,
  "completedAt" TIMESTAMPTZ(3),
  "cancelledAt" TIMESTAMPTZ(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ActionTaken_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ActionTaken_version_positive_check" CHECK ("version" > 0),
  CONSTRAINT "ActionTaken_description_bounds_check"
    CHECK ("description" = btrim("description") AND char_length("description") BETWEEN 1 AND 2000 AND "description" !~ '[[:cntrl:]]'),
  CONSTRAINT "ActionTaken_result_bounds_check"
    CHECK (char_length("result") <= 2000 AND "result" !~ '[[:cntrl:]]'),
  CONSTRAINT "ActionTaken_followUpNote_bounds_check"
    CHECK (char_length("followUpNote") <= 2000 AND "followUpNote" !~ '[[:cntrl:]]'),
  CONSTRAINT "ActionTaken_followUpRequired_note_check"
    CHECK (NOT "followUpRequired" OR (char_length(btrim("followUpNote")) BETWEEN 5 AND 2000)),
  CONSTRAINT "ActionTaken_followUpNote_trimmed_check"
    CHECK ("followUpNote" = btrim("followUpNote")),
  CONSTRAINT "ActionTaken_attachmentNotes_bounds_check"
    CHECK (char_length("attachmentNotes") <= 1000 AND "attachmentNotes" = btrim("attachmentNotes") AND "attachmentNotes" !~ '[[:cntrl:]]'),
  CONSTRAINT "ActionTaken_terminal_metadata_check" CHECK (
    ("state" IN ('PLANNED', 'IN_PROGRESS') AND "performedById" IS NULL AND "completedAt" IS NULL AND "cancelledAt" IS NULL AND "cancellationReason" IS NULL)
    OR ("state" = 'COMPLETED' AND "performedById" IS NOT NULL AND "completedAt" IS NOT NULL AND "cancelledAt" IS NULL AND "cancellationReason" IS NULL AND char_length(btrim("result")) BETWEEN 1 AND 2000 AND NOT "followUpRequired")
    OR ("state" = 'CANCELLED' AND "performedById" IS NULL AND "completedAt" IS NULL AND "cancelledAt" IS NOT NULL AND "cancellationReason" IS NOT NULL AND "cancellationReason" = btrim("cancellationReason") AND char_length("cancellationReason") BETWEEN 5 AND 250 AND "cancellationReason" !~ '[[:cntrl:]]')
  )
);

CREATE UNIQUE INDEX "ActionTaken_ticketId_clientRequestId_key" ON "ActionTaken"("ticketId", "clientRequestId");
CREATE INDEX "ActionTaken_ticketId_createdAt_id_idx" ON "ActionTaken"("ticketId", "createdAt", "id");
CREATE INDEX "ActionTaken_assigneeId_state_createdAt_id_idx" ON "ActionTaken"("assigneeId", "state", "createdAt", "id");

ALTER TABLE "ActionTaken"
  ADD CONSTRAINT "ActionTaken_ticketId_fkey"
    FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ActionTaken_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ActionTaken_assigneeId_fkey"
    FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ActionTaken_performedById_fkey"
    FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ActionRevision" (
  "id" SERIAL NOT NULL,
  "actionId" INTEGER NOT NULL,
  "version" INTEGER NOT NULL,
  "actorId" INTEGER NOT NULL,
  "kind" "ActionRevisionKind" NOT NULL,
  "snapshot" JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ActionRevision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ActionRevision_version_positive_check" CHECK ("version" > 0),
  CONSTRAINT "ActionRevision_snapshot_object_check" CHECK (jsonb_typeof("snapshot") = 'object')
);

CREATE UNIQUE INDEX "ActionRevision_actionId_version_key" ON "ActionRevision"("actionId", "version");

ALTER TABLE "ActionRevision"
  ADD CONSTRAINT "ActionRevision_actionId_fkey"
    FOREIGN KEY ("actionId") REFERENCES "ActionTaken"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ActionRevision_actorId_fkey"
    FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "TicketStatusEvent" (
  "id" SERIAL NOT NULL,
  "ticketId" INTEGER NOT NULL,
  "fromStatus" "CurrentStatus" NOT NULL,
  "toStatus" "CurrentStatus" NOT NULL,
  "actorId" INTEGER NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TicketStatusEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TicketStatusEvent_distinct_status_check" CHECK ("fromStatus" <> "toStatus")
);

CREATE INDEX "TicketStatusEvent_ticketId_createdAt_id_idx" ON "TicketStatusEvent"("ticketId", "createdAt", "id");

ALTER TABLE "TicketStatusEvent"
  ADD CONSTRAINT "TicketStatusEvent_ticketId_fkey"
    FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "TicketStatusEvent_actorId_fkey"
    FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Ticket_requesterUserId_resolvedAt_id_idx" ON "Ticket"("requesterUserId", "resolvedAt", "id");
CREATE INDEX "Ticket_currentStatus_resolvedAt_id_idx" ON "Ticket"("currentStatus", "resolvedAt", "id");

COMMIT;
