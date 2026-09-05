-- Preserve Lab 1 categories while adding the active/reference-data contract.
ALTER TABLE "Category"
  ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TYPE "RequestedPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');
CREATE TYPE "CurrentStatus" AS ENUM ('NEW');
CREATE TYPE "AttachmentStatus" AS ENUM ('ACTIVE', 'REMOVED');

CREATE SEQUENCE "ticket_number_seq" START 1;

CREATE TABLE "Requester" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Requester_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RelatedSystem" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RelatedSystem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Ticket" (
    "id" SERIAL NOT NULL,
    "ticketNumber" TEXT NOT NULL,
    "ticketSequence" BIGINT NOT NULL DEFAULT nextval('"ticket_number_seq"'::regclass),
    "ticketDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requesterId" INTEGER NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "relatedSystemId" INTEGER NOT NULL,
    "summary" TEXT NOT NULL,
    "requestedPriority" "RequestedPriority" NOT NULL,
    "description" TEXT NOT NULL,
    "itPriority" TEXT,
    "currentStatus" "CurrentStatus" NOT NULL DEFAULT 'NEW',
    "clientRequestId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

ALTER SEQUENCE "ticket_number_seq" OWNED BY "Ticket"."ticketSequence";

CREATE TABLE "Attachment" (
    "id" SERIAL NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "originalName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "status" "AttachmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "removedAt" TIMESTAMP(3),
    "removalReason" TEXT,
    "removedByRequesterId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Requester_email_key" ON "Requester"("email");
CREATE UNIQUE INDEX "RelatedSystem_name_key" ON "RelatedSystem"("name");
CREATE UNIQUE INDEX "Ticket_ticketNumber_key" ON "Ticket"("ticketNumber");
CREATE UNIQUE INDEX "Ticket_ticketSequence_key" ON "Ticket"("ticketSequence");
CREATE UNIQUE INDEX "Ticket_clientRequestId_key" ON "Ticket"("clientRequestId");
CREATE UNIQUE INDEX "Attachment_storageKey_key" ON "Attachment"("storageKey");

CREATE INDEX "Category_isActive_name_idx" ON "Category"("isActive", "name");
CREATE INDEX "Requester_isActive_name_idx" ON "Requester"("isActive", "name");
CREATE INDEX "RelatedSystem_isActive_name_idx" ON "RelatedSystem"("isActive", "name");
CREATE INDEX "Ticket_requesterId_updatedAt_id_idx" ON "Ticket"("requesterId", "updatedAt", "id");
CREATE INDEX "Ticket_requesterId_categoryId_updatedAt_idx" ON "Ticket"("requesterId", "categoryId", "updatedAt");
CREATE INDEX "Ticket_requesterId_relatedSystemId_updatedAt_idx" ON "Ticket"("requesterId", "relatedSystemId", "updatedAt");
CREATE INDEX "Ticket_requesterId_requestedPriority_updatedAt_idx" ON "Ticket"("requesterId", "requestedPriority", "updatedAt");
CREATE INDEX "Ticket_requesterId_currentStatus_updatedAt_idx" ON "Ticket"("requesterId", "currentStatus", "updatedAt");
CREATE INDEX "Ticket_categoryId_idx" ON "Ticket"("categoryId");
CREATE INDEX "Ticket_relatedSystemId_idx" ON "Ticket"("relatedSystemId");
CREATE INDEX "Attachment_ticketId_status_createdAt_idx" ON "Attachment"("ticketId", "status", "createdAt");
CREATE INDEX "Attachment_removedByRequesterId_idx" ON "Attachment"("removedByRequesterId");

ALTER TABLE "Ticket"
  ADD CONSTRAINT "Ticket_requesterId_fkey"
    FOREIGN KEY ("requesterId") REFERENCES "Requester"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Ticket_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Ticket_relatedSystemId_fkey"
    FOREIGN KEY ("relatedSystemId") REFERENCES "RelatedSystem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Attachment"
  ADD CONSTRAINT "Attachment_ticketId_fkey"
    FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Attachment_removedByRequesterId_fkey"
    FOREIGN KEY ("removedByRequesterId") REFERENCES "Requester"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
