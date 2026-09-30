import { useState } from "react";
import { ArrowRight, Download, FileText, ShieldCheck } from "lucide-react";
import { downloadDemoAsset, getDemoAssetFile, type DemoAsset } from "./api";
import type { List, Rule, User } from "./types";
import type { DemoCatalog } from "./copilot-context";
import { canNavigate, pageNames, roleOrder, roleProfiles } from "./roles";
import {
  Badge,
  ErrorBox,
  Field,
  ListMore,
  Loading,
  Notice,
  PageTitle,
  Panel,
  Refresh,
  useAction,
  useResource,
} from "./ui";

export function RolesAccess({
  user,
  mode,
  navigate,
}: {
  user: User;
  mode: "dev" | "oidc";
  navigate: (page: string) => void;
}) {
  const current = roleProfiles[user.role];
  return (
    <>
      <PageTitle
        eyebrow="Workspace guide"
        title="Roles & access"
        description="See the navigation and responsibilities for each role before you demonstrate a workflow."
      />
      <Panel
        title={`Your role: ${current.name}`}
        aside={<ShieldCheck size={20} />}
      >
        <p>{current.purpose}</p>
        <div className="demo-page-links">
          {current.pages
            .filter((page) => canNavigate(user.role, page, mode))
            .map((page) => (
              <button
                className="secondary"
                key={page}
                onClick={() => navigate(page)}
              >
                {pageNames[page]} <ArrowRight size={14} />
              </button>
            ))}
        </div>
        <p className="hint">
          Navigation is tailored to each role. Server permissions govern every
          action; the current shared workspace does not provide member-level or
          organization-level data isolation. Organization SSO authenticates
          identities; Super administrator manages their application roles.
        </p>
      </Panel>
      <div className="demo-role-grid">
        {roleOrder.map((role) => {
          const profile = roleProfiles[role];
          return (
            <article
              className={`panel demo-role-card ${role === user.role ? "current-role" : ""}`}
              key={role}
            >
              <div className="between">
                <h2>{profile.name}</h2>
                {role === user.role && <span className="pill">Your role</span>}
              </div>
              <p>{profile.purpose}</p>
              <h3>What this role can do</h3>
              <ul>
                {profile.canDo.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <details>
                <summary>Navigation for this role</summary>
                <p>
                  {profile.pages
                    .filter((page) => canNavigate(role, page, mode))
                    .map((page) => pageNames[page])
                    .join(" · ")}
                </p>
              </details>
              <p className="notice">{profile.boundary}</p>
            </article>
          );
        })}
      </div>
    </>
  );
}

export function DemoCenter({
  user,
  switchUser,
  navigate,
}: {
  user: User;
  switchUser: (id: string) => Promise<void>;
  navigate: (page: string) => void;
}) {
  const [refresh, setRefresh] = useState(0);
  const rules = useResource<List<Rule>>("/rules", refresh);
  const catalog = useResource<DemoCatalog>("/demo/copilot", refresh);
  return (
    <>
      <PageTitle
        eyebrow="Fictional demonstration workspace"
        title="Demo center"
        description="Choose a role, check preparation and use module-specific sample evidence with the client."
        actions={<Refresh onClick={() => setRefresh((n) => n + 1)} />}
      />
      <div className="notice warning">
        Development only · all demonstration people and documents are fictional.
        Switching role signs in as a different demonstration identity and is
        recorded under that identity.
      </div>
      <Panel title="Choose your demonstration role">
        <div className="demo-role-switches">
          {roleOrder.map((role) => (
            <button
              className={user.role === role ? "primary" : "secondary"}
              disabled={user.role === role}
              key={role}
              onClick={() => void switchUser(roleProfiles[role].userId)}
            >
              {roleProfiles[role].name}
            </button>
          ))}
        </div>
        <p>
          Start as Super administrator for the full tour. Use Designer for rule
          configuration, Officer for evidence preparation, Reviewer for
          independent approval, and Auditor for read-only assurance.
        </p>
        <p className="hint">
          Super administrator can demonstrate all administrator actions. Their
          own changes still need a different reviewer; a role change must also
          use a different identity.
        </p>
        <button className="text-button" onClick={() => navigate("roles")}>
          Explore navigation and responsibilities <ArrowRight size={15} />
        </button>
      </Panel>
      <Panel title="Preparation and live readiness">
        <ErrorBox error={rules.error || catalog.error} />
        <p>
          The project includes configured REST mappings, visual decision models
          and scenario tests. Your developer can run the documented demo
          preparation command on the local demonstration database. It uses the
          normal test and independent publication workflow and records each
          action.
        </p>
        <div className="demo-status-grid">
          <div>
            <strong>
              {rules.loading
                ? "…"
                : rules.data
                  ? rules.data.items.filter(
                      (rule) => rule.status === "PUBLISHED",
                    ).length
                  : "—"}
            </strong>
            <span>Published rules in loaded list</span>
          </div>
          <div>
            <strong>
              {catalog.loading
                ? "…"
                : (catalog.data?.policyStatus?.published ?? "—")}
            </strong>
            <span>Published demo procedures</span>
          </div>
          <div>
            <strong>
              {catalog.loading ? "…" : (catalog.data?.members.length ?? "—")}
            </strong>
            <span>Fictional member stories in catalog</span>
          </div>
        </div>
        <div className="demo-rule-status">
          {rules.data?.items.map((rule) => (
            <div className="between" key={rule.id}>
              <span>
                {rule.name} · v{rule.version}
              </span>
              <Badge value={rule.status} />
            </div>
          ))}
        </div>
        <ListMore query={rules} label="rules" />
        <ol className="demo-steps">
          <li>
            Check published rules and procedures; open the relevant module and
            run a live assessment for the selected member.
          </li>
          <li>
            Upload a sample below, then show extraction and independent
            verification using a different identity. Extraction requires a
            configured provider and a running document worker.
          </li>
          <li>
            Ask a suggested Copilot question after evidence exists. Presenter
            notes are discussion guidance, not model responses.
          </li>
          <li>
            For the live rule exercise, clone a prepared decision in Rules &
            Data Studio, change one or two decision-table rows, test the
            version, and demonstrate independent publication before running it
            live.
          </li>
        </ol>
        {canNavigate(user.role, "studio", "dev") && (
          <button className="secondary" onClick={() => navigate("studio")}>
            Open Rules & Data Studio <ArrowRight size={15} />
          </button>
        )}
      </Panel>
      <DemoAssetLibrary />
      <Panel title="Where real evidence comes from">
        <p>
          In production, structured member, service, contribution and payment
          values come from approved pension or ERP REST services. Business users
          map those response fields in Rules & Data Studio.
        </p>
        <p>
          Original PDFs normally come from the pension, ERP or
          document-management system and can be uploaded into the evidence
          workflow. A scheduled file feed or a specific ERP document connector
          must be integrated for your client's system; this demo library does
          not establish that connection.
        </p>
        <p className="hint">
          Uploading or verifying a PDF does not overwrite REST source values or
          automatically publish a policy. Copilot and rule outcomes support
          human review; they do not authorize a pension or release a payment.
        </p>
      </Panel>
    </>
  );
}

export function DemoAssetLibrary({
  onSelect,
}: {
  onSelect?: (asset: DemoAsset, file: File) => void;
}) {
  const assets = useResource<{ fictional: true; items: DemoAsset[] }>(
    "/demo/assets",
  );
  const [module, setModule] = useState("");
  const action = useAction();
  const modules = [...new Set(assets.data?.items.map((asset) => asset.module))];
  const shown =
    assets.data?.items.filter((asset) => !module || asset.module === module) ||
    [];
  return (
    <Panel
      title={
        onSelect ? "Choose a demonstration PDF" : "Sample evidence by module"
      }
      aside={<FileText size={19} />}
    >
      <p>
        {onSelect
          ? "Select a sample to fill the upload form. Review the selected member and file, then choose Upload & queue extraction."
          : "Download a sample for the walkthrough. Member-linked PDFs can also be selected directly from the upload page."}
      </p>
      <ErrorBox error={assets.error || action.error} />
      <Notice>{action.notice}</Notice>
      {assets.loading ? (
        <Loading text="Loading sample evidence…" />
      ) : (
        <>
          <Field label="Filter by module">
            <select value={module} onChange={(e) => setModule(e.target.value)}>
              <option value="">All modules</option>
              {modules.map((value) => (
                <option value={value} key={value}>
                  {moduleTitle(value)}
                </option>
              ))}
            </select>
          </Field>
          <div className="demo-asset-grid">
            {shown.map((asset) => (
              <article className="demo-asset" key={asset.id}>
                <span className="eyebrow">
                  {moduleTitle(asset.module)}{" "}
                  {asset.memberId ? `· ${asset.memberId}` : "· reference only"}
                </span>
                <h3>{asset.title}</h3>
                <p>{asset.description}</p>
                <p className="hint">{asset.uploadPurpose}</p>
                <div className="actions">
                  <button
                    type="button"
                    className="secondary"
                    disabled={action.busy}
                    onClick={() =>
                      void action.run(
                        () => downloadDemoAsset(asset),
                        "Sample PDF download started.",
                      )
                    }
                  >
                    <Download size={14} /> Download PDF
                  </button>
                  {onSelect && asset.memberId && (
                    <button
                      type="button"
                      className="primary"
                      disabled={action.busy}
                      onClick={() =>
                        void action.run(async () => {
                          const file = await getDemoAssetFile(asset);
                          onSelect(asset, file);
                        }, "Sample selected below. Review the form and choose Upload & queue extraction to continue.")
                      }
                    >
                      Use sample in upload
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
          {!shown.length && (
            <p className="muted">
              No sample PDFs are available for this module.
            </p>
          )}
        </>
      )}
    </Panel>
  );
}
function moduleTitle(module: string) {
  return (
    (
      {
        readiness: "Retirement readiness",
        documents: "Case & documents",
        payment: "Payment assurance",
        contribution: "Contribution assurance",
        service: "Service assurance",
        policy: "Policy intelligence",
        forecast: "Workforce forecast",
        cases: "Case handover",
      } as Record<string, string>
    )[module] || module
  );
}
