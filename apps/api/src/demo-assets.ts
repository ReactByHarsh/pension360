import { readFile } from "node:fs/promises";
import { z } from "zod";
import type { Router } from "express";
import type { Deps } from "./types.js";
import { ApiError } from "./errors.js";

const assetSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,99}$/),
    module: z.enum([
      "readiness",
      "forecast",
      "documents",
      "policy",
      "contribution",
      "service",
      "payment",
      "cases",
      "governance",
    ]),
    title: z.string().min(1).max(250),
    filename: z.string().regex(/^[A-Za-z0-9_-]+\.pdf$/),
    memberId: z
      .string()
      .regex(/^M\d{3}$/)
      .optional(),
    description: z.string().min(1).max(2000),
    uploadPurpose: z.string().min(1).max(2000),
  })
  .strict();
const directory = new URL("../../../demo-data/", import.meta.url);
let manifest: Promise<z.infer<typeof assetSchema>[]> | undefined;
function assets() {
  return (manifest ??= readFile(
    new URL("manifest.json", directory),
    "utf8",
  ).then((text) => {
    const items = z.array(assetSchema).min(1).max(100).parse(JSON.parse(text));
    if (new Set(items.map((item) => item.id)).size !== items.length)
      throw new Error("Demo asset manifest has duplicate identifiers");
    return items;
  }));
}

/** Register only behind createApp's authentication middleware. */
export function registerDemoAssetRoutes(router: Router, deps: Deps) {
  if (deps.config.env === "production") return;
  router.get("/demo/assets", async (_req, res) => {
    res.json({
      fictional: true,
      items: (await assets()).map((asset) => ({
        ...asset,
        downloadPath: `/api/v1/demo/assets/${asset.id}/download`,
      })),
    });
  });
  router.get("/demo/assets/:id/download", async (req, res) => {
    // The requested ID selects an application-supplied manifest entry. It is never a filesystem path.
    const asset = (await assets()).find((item) => item.id === req.params.id);
    if (!asset)
      throw new ApiError(404, "NOT_FOUND", "Demonstration document not found");
    const pdf = await readFile(new URL(asset.filename, directory));
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${asset.filename}"`,
    );
    res.send(pdf);
  });
}
