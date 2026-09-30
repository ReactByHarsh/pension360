import type { Role, User } from "./types";
import { canNavigate, type Page } from "./roles";

export type WorkspaceAction = {
  page: Page;
  label: string;
  description: string;
};
type Overview = {
  title: string;
  description: string;
  primary: WorkspaceAction;
  actions: WorkspaceAction[];
};
const actions: Record<Role, WorkspaceAction[]> = {
  SUPER_ADMIN: [
    {
      page: "demo",
      label: "Run the full demonstration",
      description:
        "Check prepared scenarios, switch demo identities and select sample evidence.",
    },
    {
      page: "jobs",
      label: "Check operational failures",
      description:
        "Inspect failed background work and authorize controlled retries.",
    },
    {
      page: "studio",
      label: "Manage decisions & connections",
      description:
        "Configure REST connections and walk through a tested visual rule.",
    },
    {
      page: "access",
      label: "Manage user access",
      description:
        "Register existing identities, assign roles and manage active application access.",
    },
    {
      page: "integrations",
      label: "Preview source synchronization",
      description:
        "Review incoming member and document changes before committing and assessing them.",
    },
    {
      page: "audit",
      label: "Inspect accountability",
      description: "Follow recorded actions back to the responsible identity.",
    },
  ],
  ADMIN: [
    {
      page: "jobs",
      label: "Resolve processing failures",
      description: "Inspect failure evidence before retrying a background job.",
    },
    {
      page: "studio",
      label: "Manage decisions & connections",
      description: "Maintain connections, mappings and reviewed rule versions.",
    },
    {
      page: "governance",
      label: "Manage source governance",
      description:
        "Prepare source authority and review another person's proposal.",
    },
    {
      page: "cases",
      label: "Oversee case handovers",
      description:
        "Check investigations, submissions and independently eligible approvals.",
    },
    {
      page: "integrations",
      label: "Synchronize source data",
      description:
        "Preview member and document changes, commit the import and run affected-member assessments.",
    },
    {
      page: "audit",
      label: "Review the audit trail",
      description:
        "Inspect actor, action and entity evidence across the application.",
    },
  ],
  OFFICER: [
    {
      page: "cases",
      label: "Work through investigations",
      description:
        "Open a case, record evidence and submit a recommendation for review.",
    },
    {
      page: "readiness",
      label: "Assess retirement readiness",
      description:
        "Run a published decision and inspect the saved REST evidence.",
    },
    {
      page: "documents",
      label: "Upload member evidence",
      description: "Add a case document and follow its extraction status.",
    },
    {
      page: "contribution",
      label: "Investigate service & contributions",
      description:
        "Compare contribution amounts and identify service gaps or overlap.",
    },
    {
      page: "payment",
      label: "Check payment differences",
      description:
        "Run assurance checks and investigate unexplained differences.",
    },
    {
      page: "governance",
      label: "Record a source conflict",
      description: "Document competing values for independent evidence review.",
    },
  ],
  REVIEWER: [
    {
      page: "studio",
      label: "Review decision versions",
      description:
        "Inspect tests, compare a candidate and approve or return eligible work.",
    },
    {
      page: "documents",
      label: "Verify extracted evidence",
      description:
        "Check original pages and verify another person's extracted fields.",
    },
    {
      page: "cases",
      label: "Review recommendations",
      description:
        "Approve or return another person's submitted case recommendation.",
    },
    {
      page: "policy",
      label: "Review policy procedures",
      description: "Read and publish independently eligible procedure drafts.",
    },
    {
      page: "governance",
      label: "Review source decisions",
      description:
        "Assess authority proposals and evidence-backed value conflicts.",
    },
    {
      page: "audit",
      label: "Trace a reviewed action",
      description:
        "Check the recorded identities and reasons behind a transition.",
    },
  ],
  DESIGNER: [
    {
      page: "studio",
      label: "Design, test & compare rules",
      description:
        "Map REST fields, edit JDM decisions, run scenarios and compare a published baseline.",
    },
    {
      page: "members",
      label: "Find scenario members",
      description: "Inspect member records before choosing test scenarios.",
    },
    {
      page: "policy",
      label: "Draft policy procedures",
      description: "Prepare business guidance for independent publication.",
    },
    {
      page: "governance",
      label: "Propose source authority",
      description: "Document a field's proposed source and business rationale.",
    },
  ],
  AUDITOR: [
    {
      page: "audit",
      label: "Inspect recorded actions",
      description:
        "Trace actors, actions, entities and review reasons without changing records.",
    },
    {
      page: "studio",
      label: "Inspect decision versions",
      description:
        "Read saved mappings, decision logic, versions and publication evidence.",
    },
    {
      page: "documents",
      label: "Inspect source documents",
      description:
        "Review verified fields and download available original evidence.",
    },
    {
      page: "cases",
      label: "Trace case handovers",
      description:
        "Read case status, investigation notes and recommendation history.",
    },
    {
      page: "governance",
      label: "Inspect data lineage",
      description: "Review source authority and recorded conflict decisions.",
    },
    {
      page: "integrations",
      label: "Inspect synchronization lineage",
      description:
        "Trace imported member and document changes through recorded integration runs.",
    },
  ],
};
const headings: Record<Role, { title: string; description: string }> = {
  SUPER_ADMIN: {
    title: "Platform oversight & demonstration",
    description:
      "See operational readiness, demonstrate the full workflow and hand work to an independent reviewer.",
  },
  ADMIN: {
    title: "Application operations",
    description:
      "Keep processing, source connections and review handovers moving with accountable actions.",
  },
  OFFICER: {
    title: "Your investigation workspace",
    description:
      "Prepare evidence, assess member records and move findings towards independent review.",
  },
  REVIEWER: {
    title: "Your review workbench",
    description:
      "Find work eligible for your independent review, inspect its evidence and record the next decision.",
  },
  DESIGNER: {
    title: "Your decision design workspace",
    description:
      "Turn REST source fields into tested visual decisions and prepare versions for independent publication.",
  },
  AUDITOR: {
    title: "Your assurance workspace",
    description:
      "Trace decisions and human actions through saved evidence, source lineage and the audit trail.",
  },
};
export function roleOverview(role: Role, mode: "dev" | "oidc"): Overview {
  const available = actions[role].filter((action) =>
    canNavigate(role, action.page, mode),
  );
  return { ...headings[role], primary: available[0], actions: available };
}

export type WorkspaceSummary = {
  role: Role;
  userId: string;
  asOf: string;
  scope: "shared-workspace";
  metrics: Array<{
    id: string;
    label: string;
    count: number;
    page: string;
    description: string;
  }>;
  queues: Array<{
    id: string;
    title: string;
    total: number;
    page: string;
    description: string;
    items: Array<{
      id: string;
      title: string;
      status: string;
      memberId?: string;
      updatedAt: string;
    }>;
  }>;
};
export function matchingWorkspace(
  summary: WorkspaceSummary | null,
  user: User,
): WorkspaceSummary | null {
  return summary?.role === user.role && summary.userId === user.id
    ? summary
    : null;
}
