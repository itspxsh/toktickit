import type { Express, Request, Response } from "express";
import { getPrisma } from "../prisma.js";

type ReferenceModel = {
  findMany(args: unknown): Promise<unknown>;
};

interface ReferenceDataClient {
  category: ReferenceModel;
  relatedSystem: ReferenceModel;
}

type PrismaProvider = () => ReferenceDataClient;

const SELECT = { id: true, name: true };
const ORDER_BY = { name: "asc" };

function sendReferenceError(res: Response, label: string): void {
  res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: `Unable to load ${label}.`,
    },
  });
}

/** Active reference data used by requester-facing forms. */
export function registerReferenceDataRoutes(
  app: Express,
  prismaProvider: PrismaProvider = getPrisma as unknown as PrismaProvider,
): void {
  app.get("/api/categories", async (_req: Request, res: Response) => {
    try {
      const categories = await prismaProvider().category.findMany({
        where: { isActive: true },
        select: SELECT,
        orderBy: ORDER_BY,
      });
      res.status(200).json(categories);
    } catch {
      sendReferenceError(res, "Categories");
    }
  });

  app.get("/api/related-systems", async (_req: Request, res: Response) => {
    try {
      const systems = await prismaProvider().relatedSystem.findMany({
        where: { isActive: true },
        select: SELECT,
        orderBy: ORDER_BY,
      });
      res.status(200).json(systems);
    } catch {
      sendReferenceError(res, "Related Systems");
    }
  });
}
