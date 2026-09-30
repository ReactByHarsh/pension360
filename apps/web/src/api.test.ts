import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError, getDemoAssetFile, setAccessToken } from "./api";

afterEach(() => {
  setAccessToken(null);
  vi.unstubAllGlobals();
});

describe("Demonstration document selection", () => {
  it("fetches an authenticated PDF from the fixed sample endpoint without uploading it", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response("%PDF-1.4 fictional sample", {
          headers: { "content-type": "application/pdf" },
        }),
      );
    vi.stubGlobal("fetch", fetch);
    setAccessToken("demo-token");
    const file = await getDemoAssetFile({
      id: "appointment-conflict",
      filename: "M002_appointment.pdf",
    });
    expect(file.name).toBe("M002_appointment.pdf");
    expect(file.type).toBe("application/pdf");
    expect(await file.text()).toContain("fictional sample");
    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      "/api/v1/demo/assets/appointment-conflict/download",
      expect.objectContaining({
        headers: { Authorization: "Bearer demo-token" },
        credentials: "same-origin",
      }),
    );
  });
  it("rejects external paths and traversal before sending a request", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    for (const id of [
      "../secret",
      "https://example.com/file",
      "asset?token=value",
    ]) {
      await expect(
        getDemoAssetFile({ id, filename: "sample.pdf" }),
      ).rejects.toThrow("known demonstration");
    }
    expect(fetch).not.toHaveBeenCalled();
  });
  it("does not turn an error or HTML response into upload evidence", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response("missing", { status: 404 }))
      .mockResolvedValueOnce(
        new Response("<html>proxy</html>", {
          headers: { "content-type": "text/html" },
        }),
      );
    vi.stubGlobal("fetch", fetch);
    await expect(
      getDemoAssetFile({ id: "appointment-conflict", filename: "sample.pdf" }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      getDemoAssetFile({ id: "appointment-conflict", filename: "sample.pdf" }),
    ).rejects.toThrow("supported PDF");
  });
});
describe("Authenticated API boundary", () => {
  it("passes the in-memory token and serialized business form to the API", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ id: "evaluation" }), { status: 201 }),
      );
    vi.stubGlobal("fetch", fetch);
    setAccessToken("test-token");
    await api("/evaluations", { memberId: "M001", ruleId: "rule" });
    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/evaluations",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-token",
        }),
        body: '{"memberId":"M001","ruleId":"rule"}',
      }),
    );
  });
  it("never retains authorization after logout", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response('{"user":null}', { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    setAccessToken("old-token");
    setAccessToken(null);
    await api("/session");
    expect(fetch.mock.calls[0][1].headers).not.toHaveProperty("Authorization");
  });
  it("preserves safe server error codes and request references", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            '{"error":{"code":"SELF_REVIEW","message":"A different reviewer is required.","requestId":"ref123"}}',
            { status: 403 },
          ),
        ),
    );
    await expect(api("/rules/r/review", {})).rejects.toMatchObject({
      status: 403,
      code: "SELF_REVIEW",
      requestId: "ref123",
      message: "A different reviewer is required.",
    });
  });
  it("does not surface an unexpected proxy HTML response as executable content", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response("<html>proxy failed</html>", { status: 502 }),
        ),
    );
    await expect(api("/members")).rejects.toEqual(
      new ApiError("Request failed (502).", 502),
    );
  });
});
