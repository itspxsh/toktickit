import express, { Request, Response, type NextFunction } from "express";
import cors from "cors";
import { getPrisma } from "./prisma.js";
import { registerRequesterRoutes } from "./routes/requesters.js";
import { registerTicketRoutes } from "./routes/tickets.js";
import { registerAttachmentRoutes } from "./routes/attachments.js";
import { registerReferenceDataRoutes } from "./routes/reference-data.js";
// getPrisma() is your lazy database handle. Call it INSIDE a route when you
// need the DB (Issue 4). It is intentionally unused until then.
void getPrisma;

// The Express app is exported separately from app.listen() (see index.ts) so
// Supertest can import `app` without opening a port. Do not merge these files.
export const app = express();

app.use(cors());          // already wired: lets the Vite dev server call this API
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
registerReferenceDataRoutes(app);
registerRequesterRoutes(app);
registerTicketRoutes(app);
registerAttachmentRoutes(app);

export default app;
