import { describe, expect, it } from "vitest";
import { manualTranscriptionFields } from "./ManualTranscription";
import type { DocumentField } from "./types";
describe("Manual document correction", () => {
  it("starts unavailable extraction with an explicitly uncertain blank evidence field", () => {
    expect(manualTranscriptionFields([])).toEqual([
      {
        name: "",
        value: "",
        evidence: { page: 1, quote: "" },
        uncertain: true,
      },
    ]);
  });
  it("prefills existing evidence for correction without mutating the selected document or its uncertainty", () => {
    const existing: DocumentField[] = [
      {
        name: "joiningDate",
        value: "1992-06-01",
        evidence: { page: 1, quote: "Joining date 1992-06-01" },
        uncertain: true,
      },
    ];
    const editable = manualTranscriptionFields(existing);
    editable[0].value = "1992-07-01";
    editable[0].evidence.quote = "Corrected quote";
    expect(existing[0].value).toBe("1992-06-01");
    expect(existing[0].evidence.quote).toBe("Joining date 1992-06-01");
    expect(editable[0].uncertain).toBe(true);
  });
});
