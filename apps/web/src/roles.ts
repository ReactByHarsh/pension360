import type { Role, Rule, User } from "./types";

export const pageNames = {
  dashboard: "Command center",
  members: "Member intelligence",
  readiness: "Retirement readiness",
  documents: "Case & documents",
  policy: "Policy intelligence",
  contribution: "Contribution & service",
  payment: "Payment & entitlement",
  cases: "Review cases",
  studio: "Rules & Data Studio",
  governance: "Source governance",
  jobs: "Background jobs",
  audit: "Audit trail",
  integrations: "Data integrations",
  access: "User access",
  roles: "Roles & access",
  demo: "Demo center",
  workflows: "Workflows",
} as const;
export type Page = keyof typeof pageNames;
const allPages = Object.keys(pageNames) as Page[];
const standardPages = allPages.filter((page) => page !== "access");
export const roleProfiles: Record<
  Role,
  {
    name: string;
    userId: string;
    purpose: string;
    pages: readonly Page[];
    canDo: readonly string[];
    boundary: string;
  }
> = {
  SUPER_ADMIN: {
    name: "Super administrator",
    userId: "superadmin",
    purpose: "Full product demonstration and platform oversight.",
    pages: allPages,
    canDo: [
      "Open every workspace and demonstrate all administrator actions",
      "Register existing identities, assign roles and activate or deactivate application access",
      "Preview and commit data synchronization, then explicitly run affected-member assessments",
      "Manage REST connections and source settings",
      "Configure and test rules, run assessments, upload evidence and manage cases",
      "Review and publish work created by another person; inspect jobs and audit evidence",
      "Monitor role-specific work queues and demonstrate handovers using separate demo identities",
    ],
    boundary:
      "A super administrator cannot review their own rule, uploaded document, source policy or case submission. Switch to a different demo identity to show the independent reviewer step.",
  },
  ADMIN: {
    name: "Administrator",
    userId: "admin",
    purpose: "Operate and configure the application.",
    pages: standardPages,
    canDo: [
      "Manage REST connections, source settings and background-job retries",
      "Preview and commit source synchronization, then assess affected members",
      "Configure rules, prepare policies, run assessments and manage documents and cases",
      "Independently review and publish; inspect audit evidence",
      "Track pending reviews, failed jobs and disabled source connections in the operations overview",
    ],
    boundary:
      "User access management is reserved for Super administrator. Both administrator roles can manage business configuration and integrations, and neither bypasses independent review.",
  },
  OFFICER: {
    name: "Officer",
    userId: "officer",
    purpose: "Prepare evidence and investigate member findings.",
    pages: standardPages.filter(
      (p) => !["studio", "audit", "integrations"].includes(p),
    ),
    canDo: [
      "Run published assessments and inspect forecast counts",
      "Upload documents and retry failed extraction",
      "Create and investigate cases, add notes and submit for review",
      "Propose a source conflict and ask Copilot using saved evidence",
      "Find assigned investigations and document-processing follow-up in the work overview",
    ],
    boundary:
      "Cannot configure rules, publish policies, verify uploaded documents, approve case submissions or change connections.",
  },
  REVIEWER: {
    name: "Reviewer",
    userId: "reviewer",
    purpose: "Check evidence and independently authorize governed transitions.",
    pages: standardPages,
    canDo: [
      "Run assessments and investigate cases",
      "Verify another person's extracted document fields",
      "Review, publish or retire eligible rules and procedures",
      "Review source authority and audit evidence",
      "Inspect synchronization runs and lineage without importing source data",
      "Find independently eligible work across rules, documents, cases, procedures and source governance",
    ],
    boundary:
      "Cannot edit rule definitions or manage REST connections. Rule review and publication exclude the creator, every contributing author and the submitter.",
  },
  DESIGNER: {
    name: "Rule designer",
    userId: "designer",
    purpose: "Configure REST mappings and visual decision models.",
    pages: [
      "dashboard",
      "members",
      "policy",
      "studio",
      "governance",
      "roles",
      "demo",
      "workflows",
    ],
    canDo: [
      "Create and clone visual rules, map REST fields and configure test scenarios",
      "Run rule simulations and submit passing versions for review",
      "Compare a candidate with a published baseline and inspect draft test readiness",
      "Draft procedures and source-authority settings",
      "Ask Copilot for configuration guidance",
    ],
    boundary:
      "Cannot publish their rule, run live assessments, upload member evidence, approve cases or manage connections.",
  },
  AUDITOR: {
    name: "Auditor",
    userId: "auditor",
    purpose: "Inspect evidence, lineage and the recorded audit trail.",
    pages: standardPages,
    canDo: [
      "Read member, assessment, document, case and policy evidence",
      "Inspect published rules, source governance and job status",
      "Read the audit trail and download existing source documents",
      "Inspect synchronization history and source lineage without running imports",
      "Use the assurance overview to locate published decisions, verified evidence and recorded governance work",
    ],
    boundary:
      "Read-only: cannot change business records, run rule simulations or live assessments, request Copilot answers, or retry jobs.",
  },
};
export const roleOrder: readonly Role[] = [
  "SUPER_ADMIN",
  "ADMIN",
  "OFFICER",
  "REVIEWER",
  "DESIGNER",
  "AUDITOR",
];

/** UI capability helper mirrors the server's administrator inheritance. */
export function hasRole(role: Role, ...allowed: readonly Role[]) {
  return (
    allowed.includes(role) ||
    (role === "SUPER_ADMIN" && allowed.includes("ADMIN"))
  );
}
type RuleAuthorship = Pick<Rule, "createdBy" | "authorIds" | "submittedBy">;
export function isRuleContributor(userId: string, rule: RuleAuthorship) {
  return (
    rule.createdBy === userId ||
    rule.submittedBy === userId ||
    (rule.authorIds || []).includes(userId)
  );
}
export function canIndependentlyReviewRule(user: User, rule: RuleAuthorship) {
  return (
    hasRole(user.role, "ADMIN", "REVIEWER") && !isRuleContributor(user.id, rule)
  );
}
export function canNavigate(role: Role, page: string, mode: "dev" | "oidc") {
  return (
    (page !== "demo" || mode === "dev") &&
    roleProfiles[role].pages.includes(page as Page)
  );
}
/** Apply the same guard to the hash route and the sidebar, including unknown routes. */
export function resolvePage(
  role: Role,
  requested: string,
  mode: "dev" | "oidc",
): Page {
  return canNavigate(role, requested, mode) ? (requested as Page) : "roles";
}
