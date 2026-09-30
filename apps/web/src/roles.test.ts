import { describe, expect, it } from "vitest";
import {
  canNavigate,
  canIndependentlyReviewRule,
  hasRole,
  pageNames,
  resolvePage,
  roleOrder,
  roleProfiles,
} from "./roles";

describe("Role navigation and administrator capabilities", () => {
  it("gives the full-demo identity every administrator capability without granting arbitrary reviewer-only capabilities", () => {
    expect(hasRole("SUPER_ADMIN", "ADMIN")).toBe(true);
    expect(hasRole("SUPER_ADMIN", "ADMIN", "DESIGNER")).toBe(true);
    expect(hasRole("SUPER_ADMIN", "REVIEWER")).toBe(false);
    expect(hasRole("OFFICER", "ADMIN", "REVIEWER")).toBe(false);
  });
  it("focuses officer and designer navigation and rejects direct hash navigation to their hidden pages", () => {
    expect(canNavigate("OFFICER", "documents", "dev")).toBe(true);
    expect(resolvePage("OFFICER", "studio", "dev")).toBe("roles");
    expect(resolvePage("OFFICER", "audit", "dev")).toBe("roles");
    expect(resolvePage("DESIGNER", "payment", "dev")).toBe("roles");
    expect(resolvePage("DESIGNER", "jobs", "dev")).toBe("roles");
    expect(resolvePage("DESIGNER", "studio", "dev")).toBe("studio");
  });
  it("allows the whole navigation for oversight roles but keeps development demo tools out of production routes", () => {
    for (const role of ["SUPER_ADMIN", "ADMIN", "REVIEWER", "AUDITOR"] as const)
      for (const page of Object.keys(pageNames))
        expect(resolvePage(role, page, "dev")).toBe(
          page === "access" && role !== "SUPER_ADMIN" ? "roles" : page,
        );
    for (const role of roleOrder) {
      expect(canNavigate(role, "demo", "oidc")).toBe(false);
      expect(resolvePage(role, "demo", "oidc")).toBe("roles");
      expect(resolvePage(role, "unknown-page", "dev")).toBe("roles");
      expect(canNavigate(role, "roles", "oidc")).toBe(true);
    }
  });
  it("reserves access management for super administrators and integration visibility for oversight roles", () => {
    for (const role of roleOrder) {
      expect(canNavigate(role, "access", "oidc")).toBe(role === "SUPER_ADMIN");
      expect(canNavigate(role, "integrations", "oidc")).toBe(
        ["SUPER_ADMIN", "ADMIN", "REVIEWER", "AUDITOR"].includes(role),
      );
    }
  });
  it("does not give auditors write or AI capabilities and keeps identities distinct for reviewer handover", () => {
    for (const allowed of ["ADMIN", "REVIEWER", "OFFICER", "DESIGNER"] as const)
      expect(hasRole("AUDITOR", allowed)).toBe(false);
    expect(
      new Set(roleOrder.map((role) => roleProfiles[role].userId)).size,
    ).toBe(roleOrder.length);
    expect(roleProfiles.SUPER_ADMIN.userId).toBe("superadmin");
  });
  it("blocks every rule contributor and submitter from independent review and publication, including super administrators", () => {
    const authorship = {
      createdBy: "creator",
      authorIds: ["creator", "editor"],
      submittedBy: "submitter",
    };
    for (const role of ["SUPER_ADMIN", "ADMIN", "REVIEWER"] as const) {
      for (const id of ["creator", "editor", "submitter"])
        expect(
          canIndependentlyReviewRule({ id, name: id, role }, authorship),
        ).toBe(false);
      expect(
        canIndependentlyReviewRule(
          { id: "independent", name: "Independent", role },
          authorship,
        ),
      ).toBe(true);
    }
    for (const role of ["DESIGNER", "OFFICER", "AUDITOR"] as const)
      expect(
        canIndependentlyReviewRule(
          { id: "independent", name: "Independent", role },
          authorship,
        ),
      ).toBe(false);
  });
});
