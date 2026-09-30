import { describe, it, expect } from "vitest";
import {
  encryptContent,
  decryptContent,
  validateUpload,
  validateAiResult,
  responsesBody,
  createAiProvider,
  contentKey,
  type AiRequest,
} from "../src/ai.js";
import { addMonths, forecastCounts } from "../src/domain.js";
const request: AiRequest = {
  kind: "POLICY",
  language: "ar",
  context: { question: "evidence?" },
  allowedCitationIds: ["p1"],
};
describe("AI boundaries and encrypted evidence", () => {
  it("encrypts nondeterministically and detects content tampering", () => {
    const key = Buffer.alloc(32, 17),
      plain = Buffer.from("sensitive demonstration evidence");
    const first = encryptContent(plain, key),
      second = encryptContent(plain, key);
    expect(first.equals(second)).toBe(false);
    expect(first.includes(plain)).toBe(false);
    expect(decryptContent(first, key)).toEqual(plain);
    first[29] = first[29]! ^ 1;
    expect(() => decryptContent(first, key)).toThrow();
  });
  it("requires a valid key in production", () => {
    expect(() => contentKey({ NODE_ENV: "production" })).toThrow();
    expect(() => contentKey({ DOCUMENT_ENCRYPTION_KEY: "bad" })).toThrow();
    expect(
      contentKey({
        DOCUMENT_ENCRYPTION_KEY: Buffer.alloc(32).toString("base64"),
      }),
    ).toHaveLength(32);
  });
  it("rejects spoofed formats and invalid base64", () => {
    expect(() =>
      validateUpload(
        "application/pdf",
        Buffer.from("not a pdf").toString("base64"),
      ),
    ).toThrow("matching content");
    expect(() => validateUpload("image/png", "not base64")).toThrow();
    expect(() =>
      validateUpload("image/svg+xml", Buffer.from("<svg/>").toString("base64")),
    ).toThrow();
  });
  it("preserves PDF data for direct provider input and disables response storage", () => {
    const body = responsesBody(
      {
        ...request,
        kind: "EXTRACT",
        attachment: {
          mimeType: "application/pdf",
          base64: "JVBERi0=",
          filename: "sample.pdf",
        },
      },
      "configured-model",
    ) as any;
    expect(body.store).toBe(false);
    expect(body.text.format.strict).toBe(true);
    expect(body.input[0].content[1].file_data).toBe(
      "data:application/pdf;base64,JVBERi0=",
    );
    expect(body.tools).toBeUndefined();
  });
  it("rejects unsupported policy citations and inferred field edits", () => {
    expect(() =>
      validateAiResult(
        { answer: "Claim", citationIds: ["not-provided"], fields: [] },
        { ...request, kind: "EXTRACT" },
      ),
    ).toThrow("unsupported citation");
    // Explanations drop unverifiable references instead of failing the whole answer.
    expect(
      validateAiResult(
        { answer: "Claim", citationIds: ["p1", "not-provided", "p1"], fields: [] },
        request,
      ).citationIds,
    ).toEqual(["p1"]);
    expect(() =>
      validateAiResult(
        {
          answer: "Claim",
          citationIds: [],
          fields: [
            {
              name: "DOB",
              value: "2000-01-01",
              evidence: { page: 1, quote: "DOB" },
              uncertain: false,
            },
          ],
        },
        request,
      ),
    ).toThrow("Unexpected extracted");
  });
  it("validates actual OpenAI response adapter shape through an explicit HTTP test double", async () => {
    let sent: any;
    const provider = createAiProvider(
      { OPENAI_API_KEY: "test-key", OPENAI_MODEL: "test-model" },
      async (url, options) => {
        expect(url).toBe("https://api.openai.com/v1/responses");
        sent = JSON.parse(options!.body as string);
        return new Response(
          JSON.stringify({
            status: "completed",
            output: [
              {
                type: "message",
                content: [
                  {
                    type: "output_text",
                    text: JSON.stringify({
                      answer: "Evidence only",
                      citationIds: ["p1"],
                      fields: [],
                    }),
                  },
                ],
              },
            ],
          }),
          { status: 200 },
        );
      },
    );
    expect((await provider.complete(request)).citationIds).toEqual(["p1"]);
    expect(sent.store).toBe(false);
  });
  it("does not mask incomplete output or provider rate limits as successful answers", async () => {
    const incomplete = createAiProvider(
      { OPENAI_API_KEY: "x", OPENAI_MODEL: "x" },
      async () => new Response(JSON.stringify({ status: "incomplete" })),
    );
    await expect(incomplete.complete(request)).rejects.toMatchObject({
      code: "AI_INCOMPLETE",
    });
    const limited = createAiProvider(
      { OPENAI_API_KEY: "x", OPENAI_MODEL: "x" },
      async () => new Response("", { status: 429 }),
    );
    await expect(limited.complete(request)).rejects.toMatchObject({
      status: 429,
    });
  });
  it("switches to compatible text endpoint without accepting unsupported offline vision", async () => {
    let url = "";
    const p = createAiProvider(
      {
        AI_PROVIDER: "compatible",
        OFFLINE_LLM_BASE_URL: "http://127.0.0.1:8080/v1",
        OFFLINE_LLM_MODEL: "test",
      },
      async (u) => {
        url = String(u);
        return new Response(
          JSON.stringify({
            choices: [
              {
                finish_reason: "stop",
                message: {
                  content: JSON.stringify({
                    answer: "Local answer",
                    citationIds: [],
                    fields: [],
                  }),
                },
              },
            ],
          }),
        );
      },
    );
    expect((await p.complete(request)).answer).toBe("Local answer");
    expect(url).toContain("/chat/completions");
    await expect(
      p.complete({
        ...request,
        attachment: { mimeType: "image/png", base64: "abc", filename: "x.png" },
      }),
    ).rejects.toMatchObject({ code: "OFFLINE_VISION_NOT_CONFIGURED" });
  });
  it("reports absent credentials or disabled provider honestly", async () => {
    await expect(createAiProvider({}).complete(request)).rejects.toMatchObject({
      code: "AI_NOT_CONFIGURED",
    });
    await expect(
      createAiProvider({ AI_PROVIDER: "disabled" }).complete(request),
    ).rejects.toMatchObject({ code: "AI_UNAVAILABLE" });
  });
  it("rejects malformed completed envelopes with a controlled provider error", async () => {
    for (const envelope of [
      null,
      { status: "completed", output: {} },
      { status: "completed", output: [null] },
      { status: "completed", output: [{ type: "message", content: {} }] },
    ]) {
      const p = createAiProvider(
        { OPENAI_API_KEY: "x", OPENAI_MODEL: "x" },
        async () => new Response(JSON.stringify(envelope)),
      );
      await expect(p.complete(request)).rejects.toMatchObject({
        code: "AI_INVALID_OUTPUT",
        status: 502,
      });
    }
  });
  it("rejects truncated offline completions even when their JSON happens to parse", async () => {
    const p = createAiProvider(
      {
        AI_PROVIDER: "compatible",
        OFFLINE_LLM_BASE_URL: "http://localhost/v1",
        OFFLINE_LLM_MODEL: "x",
      },
      async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                finish_reason: "length",
                message: {
                  content: '{"answer":"partial","citationIds":[],"fields":[]}',
                },
              },
            ],
          }),
        ),
    );
    await expect(p.complete(request)).rejects.toMatchObject({
      code: "AI_INCOMPLETE",
    });
  });
});
describe("calendar volume forecast", () => {
  it("clamps month end across leap years without timezone conversion", () => {
    expect(addMonths("2024-01-31", 1)).toBe("2024-02-29");
    expect(addMonths("2023-01-31", 1)).toBe("2023-02-28");
    expect(addMonths("2024-03-31", -1)).toBe("2024-02-29");
  });
  it("uses inclusive start/exclusive horizon and records assumptions", () => {
    const r = forecastCounts(
      ["2026-09-25", "2027-09-24", "2027-09-25"],
      "2026-09-25",
      12,
      1,
    );
    expect(r.baselineCount).toBe(2);
    expect(r.scenarioCount).toBe(1);
    expect(r.assumptions).toHaveLength(4);
    expect((r as any).liability).toBeUndefined();
  });
});
