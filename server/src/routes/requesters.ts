import type { Express, Request, Response } from "express";
import type { PrismaClient } from "@prisma/client";
import { getPrisma } from "../prisma.js";

type RequesterReader = Pick<PrismaClient, "requester">;
type PrismaProvider = () => RequesterReader;

/**
 * Register the unscoped selector endpoint. Requester selection happens before a
 * testing context exists, so this endpoint intentionally does not require the
 * X-Development-Requester-Id header.
 */
export function registerRequesterRoutes(
  app: Express,
  prismaProvider: PrismaProvider = getPrisma,
): void {
  app.get("/api/requesters", async (_req: Request, res: Response) => {
    try {
      const requesters = await prismaProvider().requester.findMany({
        where: { isActive: true },
        select: { id: true, name: true, email: true },
        orderBy: { name: "asc" },
      });
      res.status(200).json(requesters);
    } catch {
      res.status(500).json({
        error: {
          code: "INTERNAL_ERROR",
          message: "Unable to load Development Requesters.",
        },
      });
    }
  });
}
