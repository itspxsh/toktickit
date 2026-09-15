-- Lab 3 forward-only data foundation. Existing Lab 2 tables and rows are preserved.
BEGIN;

CREATE TYPE "UserRole" AS ENUM ('REQUESTER', 'IT_STAFF', 'ADMIN');
CREATE TYPE "ItPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

ALTER TYPE "CurrentStatus" ADD VALUE 'OPEN';
ALTER TYPE "CurrentStatus" ADD VALUE 'IN_PROGRESS';
ALTER TYPE "CurrentStatus" ADD VALUE 'WAITING_FOR_REQUESTER';
ALTER TYPE "CurrentStatus" ADD VALUE 'RESOLVED';
ALTER TYPE "CurrentStatus" ADD VALUE 'CLOSED';
ALTER TYPE "CurrentStatus" ADD VALUE 'REOPENED';
ALTER TYPE "CurrentStatus" ADD VALUE 'CANCELLED';

CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "User_isActive_role_name_idx" ON "User"("isActive", "role", "name");
CREATE INDEX "User_role_isActive_idx" ON "User"("role", "isActive");

CREATE TABLE "Session" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "invalidatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");
CREATE INDEX "Session_userId_expiresAt_idx" ON "Session"("userId", "expiresAt");
CREATE INDEX "Session_expiresAt_invalidatedAt_idx" ON "Session"("expiresAt", "invalidatedAt");

CREATE TABLE "PublicComment" (
    "id" SERIAL NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "authorUserId" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublicComment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PublicComment_ticketId_createdAt_id_idx" ON "PublicComment"("ticketId", "createdAt", "id");

CREATE TABLE "InternalNote" (
    "id" SERIAL NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "authorUserId" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InternalNote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InternalNote_ticketId_createdAt_id_idx" ON "InternalNote"("ticketId", "createdAt", "id");

ALTER TABLE "Requester" ADD COLUMN "userId" INTEGER;
ALTER TABLE "Ticket"
  ADD COLUMN "requesterUserId" INTEGER,
  ADD COLUMN "assignedStaffId" INTEGER,
  ADD COLUMN "requesterResolvedAt" TIMESTAMP(3);
ALTER TABLE "Attachment" ADD COLUMN "removedByUserId" INTEGER;

-- A non-loginable, one-way bootstrap hash is replaced by the environment-backed
-- seed when a development/test database is initialized. No clear-text secret is
-- stored in this migration.
INSERT INTO "User" ("name", "email", "passwordHash", "role", "isActive", "mustChangePassword", "createdAt", "updatedAt")
SELECT "name", lower(trim("email")),
       '$scrypt$N=16384,r=8,p=1$3lEAAE84MtKq36w8VGKvaA$vwum5eXwdKdoJd7CCRvF/t5FFstx6da3QHcfhK02+HQ',
       'REQUESTER'::"UserRole", "isActive", true, "createdAt", "updatedAt"
FROM "Requester"
ORDER BY "id";

UPDATE "Requester" AS r
SET "userId" = u."id"
FROM "User" AS u
WHERE lower(trim(r."email")) = u."email";

UPDATE "Ticket" AS t
SET "requesterUserId" = r."userId"
FROM "Requester" AS r
WHERE t."requesterId" = r."id";

UPDATE "Attachment" AS a
SET "removedByUserId" = r."userId"
FROM "Requester" AS r
WHERE a."removedByRequesterId" = r."id";

-- Keep future allocation ahead of every preserved Lab 2 ticket sequence.
SELECT setval(
  'ticket_number_seq',
  COALESCE((SELECT MAX("ticketSequence") FROM "Ticket"), 0),
  true
);

-- Invalid or unmapped rows make the migration fail closed at these constraints.
ALTER TABLE "Requester" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "Ticket" ALTER COLUMN "requesterUserId" SET NOT NULL;
ALTER TABLE "Ticket"
  ALTER COLUMN "itPriority" TYPE "ItPriority"
  USING CASE
    WHEN "itPriority" IS NULL OR btrim("itPriority") = '' THEN NULL
    ELSE upper(btrim("itPriority"))::"ItPriority"
  END;

CREATE UNIQUE INDEX "Requester_userId_key" ON "Requester"("userId");
CREATE INDEX "Ticket_requesterUserId_updatedAt_id_idx" ON "Ticket"("requesterUserId", "updatedAt", "id");
CREATE INDEX "Ticket_assignedStaffId_currentStatus_updatedAt_idx" ON "Ticket"("assignedStaffId", "currentStatus", "updatedAt");
CREATE INDEX "Ticket_itPriority_currentStatus_updatedAt_idx" ON "Ticket"("itPriority", "currentStatus", "updatedAt");
CREATE INDEX "Attachment_removedByUserId_idx" ON "Attachment"("removedByUserId");

ALTER TABLE "Requester"
  ADD CONSTRAINT "Requester_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Ticket"
  ADD CONSTRAINT "Ticket_requesterUserId_fkey"
    FOREIGN KEY ("requesterUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Ticket_assignedStaffId_fkey"
    FOREIGN KEY ("assignedStaffId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Attachment"
  ADD CONSTRAINT "Attachment_removedByUserId_fkey"
    FOREIGN KEY ("removedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Session"
  ADD CONSTRAINT "Session_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PublicComment"
  ADD CONSTRAINT "PublicComment_ticketId_fkey"
    FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "PublicComment_authorUserId_fkey"
    FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InternalNote"
  ADD CONSTRAINT "InternalNote_ticketId_fkey"
    FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InternalNote_authorUserId_fkey"
    FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
