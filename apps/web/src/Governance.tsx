import { hasRole } from "./roles";
import { useState } from "react";
import { Check, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { api } from "./api";
import type { DocumentRecord, List, Member, User } from "./types";
import { MemberPicker } from "./Studio";
import { useCopilotMember } from "./Copilot";
import {
  Badge,
  DataTable,
  ErrorBox,
  Field,
  KeyValues,
  ListMore,
  Loading,
  Notice,
  PageTitle,
  Panel,
  Refresh,
  useAction,
  useResource,
} from "./ui";

type Authority = {
  id: string;
  fieldName: string;
  sourceName: string;
  rationale: string;
  status: string;
  createdBy: string;
  approvedBy?: string;
};
type Alternative = { source: string; value: string };
type Conflict = {
  id: string;
  memberId: string;
  fieldName: string;
  alternatives: Alternative[];
  status: string;
  createdBy: string;
  selectedSource?: string;
  selectedValue?: string;
  reason?: string;
  evidenceDocumentId?: string;
};

export default function Governance({ user, initialTab = 'conflicts' }: { user: User; initialTab?: 'conflicts'|'authorities' }) {
  const [refresh, setRefresh] = useState(0),
    [tab, setTab] = useState<string>(initialTab);
  const authorities = useResource<List<Authority>>(
      "/source-authorities",
      refresh,
    ),
    conflicts = useResource<List<Conflict>>("/conflicts", refresh);
  const members = useResource<List<Member>>("/members"),
    documents = useResource<List<DocumentRecord>>("/documents", refresh);
  const [fieldName, setFieldName] = useState(""),
    [sourceName, setSourceName] = useState(""),
    [rationale, setRationale] = useState("");
  const [memberId, setMemberId] = useState(""),
    [conflictField, setConflictField] = useState("dateOfBirth");
  const [alternatives, setAlternatives] = useState<Alternative[]>([
    { source: "", value: "" },
    { source: "", value: "" },
  ]);
  const [selected, setSelected] = useState<Conflict | null>(null),
    [authority, setAuthority] = useState<Authority | null>(null);
  const [source, setSource] = useState(""),
    [evidenceDocumentId, setEvidenceDocumentId] = useState(""),
    [reason, setReason] = useState("");
  const action = useAction();
  useCopilotMember(selected?.memberId || memberId);
  const canReview = hasRole(user.role, "ADMIN", "REVIEWER"),
    canDesign = hasRole(user.role, "ADMIN", "DESIGNER");
  return (
    <>
      <PageTitle
        eyebrow="Data governance"
        title="Source authority & conflicts"
        description="Record source ownership, compare conflicting values and preserve independently reviewed evidence."
        actions={<Refresh onClick={() => setRefresh((n) => n + 1)} />}
      />
      <div className="notice info">
        <ShieldCheck size={18} />
        These are recorded governance decisions. They do not overwrite core
        records, change REST facts or automatically replace rule inputs.
      </div>
      <ErrorBox
        error={
          authorities.error ||
          conflicts.error ||
          documents.error ||
          action.error
        }
      />
      <Notice>{action.notice}</Notice>
      <div className="tabs" role="tablist" aria-label="Data governance">
        <button
          role="tab"
          aria-selected={tab === "conflicts"}
          className={tab === "conflicts" ? "active" : ""}
          onClick={() => setTab("conflicts")}
        >
          Value conflicts
        </button>
        <button
          role="tab"
          aria-selected={tab === "authorities"}
          className={tab === "authorities" ? "active" : ""}
          onClick={() => setTab("authorities")}
        >
          Source authority register
        </button>
      </div>
      {tab === "authorities" && (
        <>
          {canDesign && (
            <Panel title="Propose a source authority">
              <form
                className="form-grid"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const result = await action.run(
                    () =>
                      api("/source-authorities", {
                        fieldName,
                        sourceName,
                        rationale,
                      }),
                    "Source authority proposed for independent approval.",
                  );
                  if (result) {
                    setRefresh((n) => n + 1);
                    setFieldName("");
                    setSourceName("");
                    setRationale("");
                  }
                }}
              >
                <Field label="Business field">
                  <input
                    required
                    value={fieldName}
                    onChange={(e) => setFieldName(e.target.value)}
                    placeholder="dateOfBirth"
                    maxLength={150}
                  />
                </Field>
                <Field label="Authoritative source">
                  <input
                    required
                    minLength={3}
                    value={sourceName}
                    onChange={(e) => setSourceName(e.target.value)}
                    placeholder="Approved civil registry"
                    maxLength={150}
                  />
                </Field>
                <Field label="Rationale">
                  <textarea
                    required
                    minLength={10}
                    maxLength={2000}
                    rows={3}
                    value={rationale}
                    onChange={(e) => setRationale(e.target.value)}
                  />
                </Field>
                <div>
                  <button className="primary" disabled={action.busy}>
                    <Plus size={16} />
                    Propose source
                  </button>
                </div>
              </form>
            </Panel>
          )}
          <ListMore query={authorities} label="source authorities" />
          <Panel title="Authority proposals">
            {authorities.loading ? (
              <Loading />
            ) : (
              <DataTable
                rows={authorities.data?.items || []}
                columns={[
                  { key: "fieldName", label: "Business field" },
                  { key: "sourceName", label: "Source" },
                  {
                    key: "status",
                    label: "Status",
                    render: (r) => <Badge value={r.status} />,
                  },
                  { key: "approvedBy", label: "Approved by" },
                ]}
                onRow={setAuthority}
              />
            )}
          </Panel>
          {authority && (
            <Panel
              title={authority.fieldName + " · " + authority.sourceName}
              aside={<Badge value={authority.status} />}
            >
              <KeyValues value={authority} />
              {canReview &&
                authority.createdBy !== user.id &&
                authority.status === "DRAFT" && (
                  <button
                    className="primary top-gap"
                    disabled={action.busy}
                    onClick={async () => {
                      const result = await action.run(
                        () =>
                          api(
                            "/source-authorities/" + authority.id + "/approve",
                            {},
                          ),
                        "Source authority approved and audited.",
                      );
                      if (result) {
                        setAuthority({
                          ...authority,
                          status: "APPROVED",
                          approvedBy: user.id,
                        });
                        setRefresh((n) => n + 1);
                      }
                    }}
                  >
                    <Check size={16} />
                    Approve source authority
                  </button>
                )}
              {authority.createdBy === user.id &&
                authority.status === "DRAFT" && (
                  <p className="hint">
                    A different reviewer must approve this proposal.
                  </p>
                )}
            </Panel>
          )}
        </>
      )}
      {tab === "conflicts" && (
        <>
          {hasRole(user.role, "ADMIN", "OFFICER") && (
            <Panel title="Record a source-value conflict">
              <form
                className="stack"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const result = await action.run(
                    () =>
                      api("/conflicts", {
                        memberId,
                        fieldName: conflictField,
                        alternatives,
                      }),
                    "Conflict recorded for independent review.",
                  );
                  if (result) {
                    setRefresh((n) => n + 1);
                    setAlternatives([
                      { source: "", value: "" },
                      { source: "", value: "" },
                    ]);
                  }
                }}
              >
                <div className="form-row">
                  <MemberPicker
                    members={members.data?.items || []}
                    value={memberId}
                    onChange={(id) => {
                      setMemberId(id);
                      setSelected(null);
                      setSource("");
                      setEvidenceDocumentId("");
                      setReason("");
                    }}
                  />
                  <Field label="Conflicting field">
                    <input
                      required
                      value={conflictField}
                      onChange={(e) => setConflictField(e.target.value)}
                    />
                  </Field>
                </div>
                {alternatives.map((alternative, index) => (
                  <div className="form-row" key={index}>
                    <Field label={"Source " + (index + 1)}>
                      <input
                        required
                        value={alternative.source}
                        onChange={(e) =>
                          setAlternatives(
                            alternatives.map((a, i) =>
                              i === index
                                ? { ...a, source: e.target.value }
                                : a,
                            ),
                          )
                        }
                      />
                    </Field>
                    <Field label="Recorded value">
                      <input
                        required
                        value={alternative.value}
                        onChange={(e) =>
                          setAlternatives(
                            alternatives.map((a, i) =>
                              i === index ? { ...a, value: e.target.value } : a,
                            ),
                          )
                        }
                      />
                    </Field>
                    {alternatives.length > 2 && (
                      <button
                        type="button"
                        className="icon-button danger"
                        aria-label="Remove alternative"
                        onClick={() =>
                          setAlternatives(
                            alternatives.filter((_, i) => i !== index),
                          )
                        }
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                ))}
                <div className="actions">
                  <button
                    type="button"
                    className="secondary"
                    disabled={alternatives.length >= 10}
                    onClick={() =>
                      setAlternatives([
                        ...alternatives,
                        { source: "", value: "" },
                      ])
                    }
                  >
                    <Plus size={15} />
                    Add source
                  </button>
                  <button className="primary" disabled={action.busy}>
                    Record conflict
                  </button>
                </div>
              </form>
            </Panel>
          )}
          <ListMore query={members} label="member choices" />
          <ListMore query={documents} label="document choices" />
          <ListMore query={conflicts} label="conflicts" />
          <Panel title="Conflict review queue">
            {conflicts.loading ? (
              <Loading />
            ) : (
              <DataTable
                rows={conflicts.data?.items || []}
                columns={[
                  { key: "memberId", label: "Member" },
                  { key: "fieldName", label: "Conflicting field" },
                  {
                    key: "status",
                    label: "Status",
                    render: (c) => <Badge value={c.status} />,
                  },
                  { key: "selectedSource", label: "Reviewed source" },
                  { key: "selectedValue", label: "Reviewed value" },
                ]}
                onRow={(c) => {
                  setSelected(c);
                  setSource("");
                  setEvidenceDocumentId("");
                  setReason("");
                }}
              />
            )}
          </Panel>
          {selected && (
            <Panel
              title={selected.memberId + " · " + selected.fieldName}
              aside={<Badge value={selected.status} />}
            >
              <DataTable
                rows={selected.alternatives}
                columns={[
                  { key: "source", label: "Source" },
                  { key: "value", label: "Recorded value" },
                ]}
              />
              {selected.status === "RESOLVED" ? (
                <KeyValues
                  value={{
                    selectedSource: selected.selectedSource,
                    selectedValue: selected.selectedValue,
                    evidenceDocumentId: selected.evidenceDocumentId,
                    reason: selected.reason,
                  }}
                />
              ) : canReview && selected.createdBy !== user.id ? (
                <form
                  className="stack top-gap"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const result = await action.run(
                      () =>
                        api("/conflicts/" + selected.id + "/resolve", {
                          source,
                          evidenceDocumentId,
                          reason,
                        }),
                      "Conflict resolution recorded. Core data remains unchanged.",
                    );
                    if (result) {
                      setSelected(null);
                      setRefresh((n) => n + 1);
                    }
                  }}
                >
                  <div className="form-row">
                    <Field label="Evidence-supported source">
                      <select
                        required
                        value={source}
                        onChange={(e) => setSource(e.target.value)}
                      >
                        <option value="">Select a recorded alternative</option>
                        {selected.alternatives.map((a) => (
                          <option key={a.source} value={a.source}>
                            {a.source} · {a.value}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Verified document for this member">
                      <select
                        required
                        value={evidenceDocumentId}
                        onChange={(e) => setEvidenceDocumentId(e.target.value)}
                      >
                        <option value="">Select verified evidence</option>
                        {documents.data?.items
                          .filter(
                            (d) =>
                              d.memberId === selected.memberId &&
                              d.status === "VERIFIED",
                          )
                          .map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.title}
                            </option>
                          ))}
                      </select>
                    </Field>
                  </div>
                  <Field label="Resolution reason">
                    <textarea
                      required
                      minLength={10}
                      maxLength={2000}
                      rows={3}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                    />
                  </Field>
                  <button
                    className="primary"
                    disabled={action.busy || !evidenceDocumentId || !source}
                  >
                    <ShieldCheck size={16} />
                    Record reviewed resolution
                  </button>
                </form>
              ) : (
                <p className="hint">
                  An independent reviewer must resolve this conflict using a
                  verified document for the same member.
                </p>
              )}
            </Panel>
          )}
        </>
      )}
    </>
  );
}
