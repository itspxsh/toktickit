import express, { Request, Response, type NextFunction } from "express";
import cors from "cors";
import { getPrisma } from "./prisma.js";
import { registerRequesterRoutes } from "./routes/requesters.js";
import { registerTicketRoutes } from "./routes/tickets.js";
import { registerAttachmentRoutes } from "./routes/attachments.js";
import { registerReferenceDataRoutes } from "./routes/reference-data.js";
import { registerRequesterWorkflowRoutes } from "./routes/requester-workflow.js";
import { createAuthMiddleware, createPasswordChangedMiddleware, registerAuthRoutes, requireCsrf } from "./auth.js";
import { createAdminAuthMiddleware, createRequesterAuthMiddleware, createStaffAuthMiddleware } from "./authorization.js";
import { registerStaffQueueRoutes } from "./routes/staff-queue.js";
import { registerStaffTicketDetailRoutes } from "./routes/staff-ticket-detail.js";
import { registerAdminUserRoutes } from "./routes/users-admin.js";
// getPrisma() is your lazy database handle. Call it INSIDE a route when you
// need the DB (Issue 4). It is intentionally unused until then.
void getPrisma;

// The Express app is exported separately from app.listen() (see index.ts) so
// Supertest can import `app` without opening a port. Do not merge these files.
export const app = express();

const AUTH_ORIGIN = process.env.AUTH_ORIGIN ?? "http://localhost:3000";
app.use(cors({ origin: AUTH_ORIGIN, credentials: true }));
app.use(express.json());
app.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (error && typeof error === "object" && (error as { type?: unknown }).type === "entity.parse.failed") {
    res.status(400).json({
      error: { code: "INVALID_JSON", message: "Request body must be valid JSON." },
    });
    return;
  }
  next(error);
});

// ---------------------------------------------------------------------------
// Issue 2 — API health check
// Make the test in tests/lab-01/health.test.ts pass.
// It must return HTTP 200 with JSON: { status: "ok", service: "TokTickIT API" }
// ---------------------------------------------------------------------------
app.get("/api/health", (_req: Request, res: Response) => {
  res.status(200).json({ status: "ok", service: "TokTickIT API" });
});

// ---------------------------------------------------------------------------
registerAuthRoutes(app);
const authenticated = createAuthMiddleware();
const authenticatedAndChanged = createPasswordChangedMiddleware(authenticated);
const requesterAuthenticated = createRequesterAuthMiddleware();
const staffAuthenticated = createStaffAuthMiddleware();
const adminAuthenticated = createAdminAuthMiddleware();
registerReferenceDataRoutes(app, undefined, authenticatedAndChanged);
registerRequesterRoutes(app, undefined, authenticatedAndChanged);
registerRequesterWorkflowRoutes(app, undefined, authenticatedAndChanged);
// One shared requester guard covers both Lab 2 ticket and attachment routes;
// write handlers add CSRF independently so reads remain safe and usable.
app.use("/api/tickets", requesterAuthenticated);
registerTicketRoutes(app, undefined, undefined, requireCsrf);
registerAttachmentRoutes(app, undefined, undefined, requireCsrf);
registerStaffQueueRoutes(app, undefined, staffAuthenticated);
registerStaffTicketDetailRoutes(app, undefined, staffAuthenticated, requireCsrf);
registerAdminUserRoutes(app, undefined, adminAuthenticated, requireCsrf);

export default app;
