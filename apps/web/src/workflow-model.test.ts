import { describe, expect, it } from "vitest";
import { canPublishWorkflow, cleanWorkflowBindings, readWorkflowCondition, type WorkflowDefinition } from "./workflow-model";

describe("workflow designer governance and conditions", () => {
  const draft = { status: "DRAFT", createdBy: "designer", authorIds: ["designer", "admin"] } as WorkflowDefinition;
  it("excludes every contributing author from independent publication", () => {
    expect(canPublishWorkflow({ id: "admin", name: "Admin", role: "ADMIN" }, draft)).toBe(false);
    expect(canPublishWorkflow({ id: "reviewer", name: "Reviewer", role: "REVIEWER" }, draft)).toBe(true);
    expect(canPublishWorkflow({ id: "officer", name: "Officer", role: "OFFICER" }, draft)).toBe(false);
  });
  it("reads only declarative conditions and never executes imported expressions", () => {
    expect(readWorkflowCondition('{"path":"rule.status","operator":"eq","value":"FINDING"}')).toEqual({ path: "rule.status", operator: "eq", value: "FINDING" });
    expect(readWorkflowCondition('${process.exit()}')).toBeNull();
    expect(readWorkflowCondition('{"path":"__proto__.constructor","operator":"eq","value":"APPROVE"}')).toBeNull();
    expect(readWorkflowCondition('{"path":"tasks.Review.decision","operator":"eq","value":"APPROVE"}')?.path).toBe("tasks.Review.decision");
  });
  it("removes stale bindings and makes reviewer tasks independent", () => {
    expect(cleanWorkflowBindings({ removed: { ruleId: "old" }, Review: { role: "REVIEWER", independent: false, ruleId: "stale" }, Assess: { role: "OFFICER", ruleId: "published" } }, [{ id: "Review", type: "bpmn:UserTask" }, { id: "Assess", type: "bpmn:BusinessRuleTask" }])).toEqual({ Review: { role: "REVIEWER", independent: true }, Assess: { ruleId: "published" } });
  });
});
