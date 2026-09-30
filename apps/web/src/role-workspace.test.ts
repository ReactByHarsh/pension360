import { describe, expect, it } from "vitest";
import {
  matchingWorkspace,
  roleOverview,
  type WorkspaceSummary,
} from "./role-workspace";
import { canNavigate, roleOrder } from "./roles";

describe("Role-focused work overview", () => {
  it("provides four to six real, authorized actions for every role in both modes", () => {
    for (const role of roleOrder)
      for (const mode of ["dev", "oidc"] as const) {
        const overview = roleOverview(role, mode);
        expect(overview.actions.length).toBeGreaterThanOrEqual(4);
        expect(overview.actions.length).toBeLessThanOrEqual(6);
        expect(overview.actions).toContain(overview.primary);
        expect(
          new Set(overview.actions.map((action) => action.page)).size,
        ).toBe(overview.actions.length);
        for (const action of overview.actions)
          expect(canNavigate(role, action.page, mode)).toBe(true);
        if (mode === "oidc")
          expect(
            overview.actions.some((action) => action.page === "demo"),
          ).toBe(false);
      }
  });
  it("prioritizes each role's actual job while keeping the full demonstration out of production", () => {
    expect(roleOverview("OFFICER", "dev").primary.page).toBe("cases");
    expect(roleOverview("DESIGNER", "dev").primary.page).toBe("studio");
    expect(roleOverview("REVIEWER", "dev").primary.page).toBe("studio");
    expect(roleOverview("AUDITOR", "dev").primary.page).toBe("audit");
    expect(roleOverview("ADMIN", "dev").primary.page).toBe("jobs");
    expect(roleOverview("SUPER_ADMIN", "dev").primary.page).toBe("demo");
    expect(roleOverview("SUPER_ADMIN", "oidc").primary.page).toBe("jobs");
  });
  it("does not reuse another identity's or role's work counts after a session switch", () => {
    const user = { id: "officer", name: "Officer", role: "OFFICER" as const };
    const summary: WorkspaceSummary = {
      role: "OFFICER",
      userId: "officer",
      asOf: "2026-09-25T00:00:00Z",
      scope: "shared-workspace",
      metrics: [],
      queues: [],
    };
    expect(matchingWorkspace(summary, user)).toBe(summary);
    expect(
      matchingWorkspace({ ...summary, userId: "other-officer" }, user),
    ).toBeNull();
    expect(
      matchingWorkspace({ ...summary, role: "SUPER_ADMIN" }, user),
    ).toBeNull();
    expect(matchingWorkspace(null, user)).toBeNull();
  });
});
