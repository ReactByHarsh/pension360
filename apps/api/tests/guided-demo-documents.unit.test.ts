import express from "express";
import request from "supertest";
import { describe, it, expect, vi } from "vitest";
import type { Pool } from "pg";
import { loadConfig } from "../src/config.js";
import { errorHandler } from "../src/errors.js";
import { buildGuidedDocument, guidedDocumentKinds, registerGuidedDocumentRoutes, type GuidedDocumentRecord } from "../src/guided-demo-documents.js";
import { guidedTemplates } from "../src/guided-demo-data.js";

const batchId = "741b9b94-e58a-4b8c-a072-066015d56d5c";
const memberId = "GDEMO-NEW-002";
function record(): GuidedDocumentRecord {
  return {batchId,memberId,batchName:"Fresh entered sample",sourceSystem:"Pension / ERP",importMethod:"MANUAL",isSample:false,importedAt:"2026-10-06T18:00:00.000Z",facts:structuredClone(guidedTemplates[1]!.rows[0]!)};
}
function app({signedIn = true, production = false, found = true} = {}) {
  const value = record();
  const query = vi.fn().mockResolvedValue({rows:found ? [{facts:value.facts,batch_name:value.batchName,source_system:value.sourceSystem,import_method:value.importMethod,is_sample:value.isSample,created_at:new Date(value.importedAt)}] : []});
  const application = express();
  if (signedIn) application.use((req,_res,next) => {req.user={id:"officer",name:"Officer",role:"OFFICER"};next();});
  const router = express.Router();
  registerGuidedDocumentRoutes(router,{config:{...loadConfig({NODE_ENV:"test"}),env:production ? "production" : "test"},pool:{query} as unknown as Pool});
  application.use("/api/v1",router);application.use(errorHandler);
  return {application,query};
}
const path = `/api/v1/guided-demo/batches/${batchId}/members/${memberId}/sample-document`;

describe("Guided data extract PDFs", () => {
  it("uses the actual new member ID, provenance and competing dates without claiming independent evidence", () => {
    const pdf=buildGuidedDocument(record(),"profile").toString("ascii");
    expect(pdf.startsWith("%PDF-1.4")).toBe(true);
    expect(pdf).toContain(memberId);expect(pdf).toContain(batchId);
    expect(pdf).toContain("1991-06-01");expect(pdf).toContain("1991-07-01");
    expect(pdf).toContain("not independent source evidence");
    expect(pdf).toContain("not labelled");expect(pdf).toContain("fictional by this extract.");
    expect(pdf).not.toContain("All names and facts are invented");
    expect(pdf).toContain("2026-10-06T18:00:00.000Z");
    expect(pdf).toContain("retained in the system record");
  });
  it("does not invent missing amounts or silently change zero, false or negative values", () => {
    const value=record();value.facts.proposedBaisa=950000;value.facts.approvedBaisa=650000;
    delete value.facts.adjustmentBaisa;value.facts.toleranceBaisa=0;
    const pdf=buildGuidedDocument(value,"payment").toString("ascii");
    expect(pdf).toContain("950000");expect(pdf).toContain("650000");
    expect(pdf).toContain("Supplied authorized adjustment \\(baisa\\): Not supplied");
    expect(pdf).toContain("Supplied comparison tolerance \\(baisa\\): 0");
    value.facts.adjustmentBaisa=-1000;value.facts.serviceVerified=false;
    expect(buildGuidedDocument(value,"payment").toString("ascii")).toContain("-1000");
    expect(buildGuidedDocument(value,"service").toString("ascii")).toContain("Source service-verified flag: false");
  });
  it("escapes PDF syntax, handles whitespace and paginates long values without truncation", () => {
    const value=record();
    value.facts.name="Maryam (Entered) \\ Test\nName";
    value.facts.organization="W".repeat(200);
    value.batchName="B".repeat(160);value.sourceSystem="S".repeat(100);value.facts.externalReference="R".repeat(200);
    const pdf=buildGuidedDocument(value,"profile").toString("ascii");
    expect(pdf).toContain("Maryam \\(Entered\\) \\\\ Test Name");
    expect(pdf).toContain("/Count 2");expect(pdf).toContain("Page 2 of 2");
    expect(pdf.match(/W/g)?.length).toBeGreaterThanOrEqual(200);
    const xref=Number(pdf.match(/startxref\n(\d+)/)![1]);expect(pdf.slice(xref,xref+4)).toBe("xref");
    for (const match of pdf.matchAll(/(\d{10}) 00000 n/g)) expect(pdf.slice(Number(match[1]))).toMatch(/^\d+ 0 obj/);
  });
  it("explicitly rejects unsupported primary exported characters without corrupting records", () => {
    const value=record();value.facts.name="مريم";
    expect(() => buildGuidedDocument(value,"profile")).toThrow("English/ASCII");
    expect(value.facts.name).toBe("مريم");
    value.facts.name="Maryam";value.sourceSystem="ERP\u0000injected";
    expect(() => buildGuidedDocument(value,"profile")).toThrow("English/ASCII");
  });
  it("generates every kind from every English sample template", () => {
    for (const template of guidedTemplates) for (const facts of template.rows) for (const kind of guidedDocumentKinds) {
      const value={...record(),facts,isSample:true};
      const pdf=buildGuidedDocument(value,kind);
      expect(pdf.length).toBeGreaterThan(2000);expect(pdf.length).toBeLessThan(50000);
      expect(pdf.toString("ascii")).toContain("Fictional sample data");
    }
  });
});

describe("Guided PDF download routes", () => {
  it("requires a signed-in user and performs no query when signed out", async () => {
    const {application,query}=app({signedIn:false});
    expect((await request(application).get(path)).status).toBe(401);expect(query).not.toHaveBeenCalled();
  });
  it("is absent in production", async () => {
    const {application,query}=app({production:true});
    expect((await request(application).get(path)).status).toBe(404);expect(query).not.toHaveBeenCalled();
  });
  it("restricts the requested record to the requested batch and delivers a safe PDF attachment", async () => {
    const {application,query}=app();const res=await request(application).get(`${path}?kind=service`);
    expect(res.status).toBe(200);expect(res.headers["content-type"]).toContain("application/pdf");
    expect(res.headers["content-disposition"]).toBe(`attachment; filename="Pension360_${memberId}_service_data_extract.pdf"`);
    expect(res.headers["cache-control"]).toBe("private, no-store");
    expect(query).toHaveBeenCalledWith(expect.stringContaining("WHERE r.batch_id = $1 AND r.member_id = $2"),[batchId,memberId]);
    const missing=app({found:false});expect((await request(missing.application).get(path)).status).toBe(404);
  });
  it("rejects invalid identifiers, unsupported kinds and multiple kinds before querying", async () => {
    const {application,query}=app();
    for (const url of [path.replace(batchId,"not-a-uuid"),path.replace(memberId,"bad%0D%0Aname"),`${path}?kind=certificate`,`${path}?kind=profile&kind=payment`]) expect((await request(application).get(url)).status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });
});
