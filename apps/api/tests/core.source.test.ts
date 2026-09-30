import { afterAll, beforeAll, describe, it, expect } from "vitest";
import http, { type Server } from "node:http";
import { fetchSource } from "../src/source.js";
import { loadConfig } from "../src/config.js";
import type { Config } from "../src/config.js";
import type { Db } from "../src/db.js";
import type { Source } from "../src/types.js";
describe("bounded registered HTTP connector", () => {
  let server: Server;
  let origin: string;
  let config: Config;
  let db: Db;
  let followed = 0;
  beforeAll(async () => {
    server = http.createServer((req, res) => {
      if (req.url === "/redirect") {
        res.writeHead(302, { location: "/target" });
        res.end();
        return;
      }
      if (req.url === "/target") {
        followed++;
        res.writeHead(200, { "content-type": "application/json" });
        res.end("{}");
        return;
      }
      if (req.url === "/large") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ text: "x".repeat(5000) }));
        return;
      }
      if (req.url === "/html") {
        res.writeHead(200, { "content-type": "text/html" });
        res.end("<html>not facts</html>");
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          person: { dateOfBirth: "1970-03-10" },
          source: "fictional",
        }),
      );
    });
    server.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No address");
    origin = `http://127.0.0.1:${address.port}`;
    config = loadConfig({ NODE_ENV: "test" });
    config.sourceAllowedOrigins = [origin];
    config.sourceAllowPrivateOrigins = [origin];
    config.sourceAllowHttpOrigins = [origin];
    config.maxSourceBytes = 1000;
    db = {
      query: async () => ({
        rows: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            name: "Test source",
            base_url: origin,
            enabled: true,
          },
        ],
      }),
    } as unknown as Db;
  });
  afterAll(async () => {
    if (server)
      await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  const source = (path: string): Source => ({
    connectionId: "11111111-1111-4111-8111-111111111111",
    path,
    method: "GET",
    bindings: [],
  });
  it("reads real JSON and captures retrieval evidence", async () => {
    const result = await fetchSource(
      db,
      config,
      source("/facts"),
      "M001",
      "2026-09-25",
    );
    expect(result.sourceResponse).toMatchObject({
      person: { dateOfBirth: "1970-03-10" },
    });
    expect(result.provenance.responseSha256).toMatch(/^[a-f0-9]{64}$/);
  });
  it("does not follow HTTP redirects", async () => {
    await expect(
      fetchSource(db, config, source("/redirect"), "M001", "2026-09-25"),
    ).rejects.toMatchObject({ code: "SOURCE_HTTP_ERROR" });
    expect(followed).toBe(0);
  });
  it("rejects a registered private host without explicit private-network permission", async () => {
    await expect(
      fetchSource(
        db,
        { ...config, sourceAllowPrivateOrigins: [] },
        source("/facts"),
        "M001",
        "2026-09-25",
      ),
    ).rejects.toMatchObject({ code: "SOURCE_ADDRESS_BLOCKED" });
  });
  it("bounds response size and rejects non-JSON content", async () => {
    await expect(
      fetchSource(db, config, source("/large"), "M001", "2026-09-25"),
    ).rejects.toMatchObject({ code: "SOURCE_TOO_LARGE" });
    await expect(
      fetchSource(db, config, source("/html"), "M001", "2026-09-25"),
    ).rejects.toMatchObject({ code: "SOURCE_INVALID_RESPONSE" });
  });
});
