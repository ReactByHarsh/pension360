import { useState } from "react";
import { Plus, ShieldCheck } from "lucide-react";
import { api } from "./api";
import type { List, Role, User } from "./types";
import { roleOrder, roleProfiles } from "./roles";
import {
  Badge,
  DataTable,
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
import { date } from "./util";
import "./administration.css";

export type AccessUser = {
  id: string;
  displayName: string;
  role: Role;
  active: boolean;
  revision: number;
  createdAt: string;
  updatedAt: string;
};
export function accessUserPath(id: string) {
  return `/access/users/${encodeURIComponent(id)}`;
}
export default function UserAccess({
  user,
  refreshSession,
}: {
  user: User;
  refreshSession: () => Promise<void>;
}) {
  const [refresh, setRefresh] = useState(0);
  const query = useResource<List<AccessUser>>(
    user.role === "SUPER_ADMIN" ? "/access/users" : null,
    refresh,
  );
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<AccessUser | null>(null);
  const [id, setId] = useState(""),
    [displayName, setDisplayName] = useState(""),
    [role, setRole] = useState<Role>("OFFICER"),
    [active, setActive] = useState(true),
    [reason, setReason] = useState("");
  const action = useAction();
  function select(record: AccessUser) {
    setCreating(false);
    setSelected(record);
    setId(record.id);
    setDisplayName(record.displayName);
    setRole(record.role);
    setActive(record.active);
    setReason("");
  }
  function startCreate() {
    setSelected(null);
    setCreating(true);
    setId("");
    setDisplayName("");
    setRole("OFFICER");
    setActive(true);
    setReason("");
  }
  if (user.role !== "SUPER_ADMIN")
    return (
      <div className="notice warning">
        User access is available to a Super administrator.
      </div>
    );
  return (
    <>
      <PageTitle
        eyebrow="Platform administration"
        title="User access"
        description="Authorize existing identities, assign their application role and control whether they can access Pension360."
        actions={<Refresh onClick={() => setRefresh((n) => n + 1)} />}
      />
      <div className="notice info">
        <ShieldCheck size={18} />
        <span>
          This controls application access. Identities, passwords, sign-in and
          multifactor authentication remain with your organization identity
          provider. Every access change requires a reason and is audited.
        </span>
      </div>
      <ErrorBox error={query.error || action.error} />
      <Notice>{action.notice}</Notice>
      <div className="actions bottom-gap">
        <button
          className="primary"
          onClick={startCreate}
          disabled={action.busy}
        >
          <Plus size={16} /> Register existing identity
        </button>
      </div>
      <ListMore query={query} label="registered users" />
      <Panel title="Access register">
        {query.loading ? (
          <Loading text="Loading authorized identities…" />
        ) : (
          <DataTable
            rows={query.data?.items || []}
            columns={[
              {
                key: "displayName",
                label: "Person",
                render: (record) => (
                  <strong>
                    {record.displayName}
                    {record.id === user.id ? " · You" : ""}
                  </strong>
                ),
              },
              { key: "id", label: "Identity" },
              {
                key: "role",
                label: "Role",
                render: (record) => roleProfiles[record.role].name,
              },
              {
                key: "active",
                label: "Access",
                render: (record) => (
                  <Badge value={record.active ? "ACTIVE" : "INACTIVE"} />
                ),
              },
              {
                key: "updatedAt",
                label: "Updated",
                render: (record) => date(record.updatedAt),
              },
            ]}
            onRow={select}
          />
        )}
      </Panel>
      {(creating || selected) && (
        <Panel
          title={
            creating
              ? "Register application access"
              : `Manage access · ${selected?.displayName}`
          }
        >
          <form
            className="form-grid"
            onSubmit={async (event) => {
              event.preventDefault();
              const changed = await action.run(
                () =>
                  creating
                    ? api<AccessUser>("/access/users", {
                        id,
                        displayName: displayName.trim(),
                        role,
                        reason: reason.trim(),
                      })
                    : api<AccessUser>(
                        accessUserPath(selected!.id),
                        {
                          revision: selected!.revision,
                          displayName: displayName.trim(),
                          role,
                          active,
                          reason: reason.trim(),
                        },
                        "PATCH",
                      ),
                creating
                  ? "Identity authorized. The person still signs in through the organization identity provider."
                  : "Application access updated and audited.",
              );
              if (changed) {
                select(changed);
                setRefresh((n) => n + 1);
                if (changed.id === user.id) await refreshSession();
              }
            }}
          >
            <Field
              label="Organization identity"
              hint="Use the exact SSO subject identifier supplied by your identity administrator. This does not create a sign-in account."
            >
              <input
                required
                maxLength={255}
                value={id}
                disabled={!creating || action.busy}
                onChange={(e) => setId(e.target.value)}
              />
            </Field>
            <Field label="Display name">
              <input
                required
                maxLength={200}
                value={displayName}
                disabled={action.busy}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </Field>
            <Field label="Application role">
              <select
                value={role}
                disabled={action.busy}
                onChange={(e) => setRole(e.target.value as Role)}
              >
                {roleOrder.map((value) => (
                  <option key={value} value={value}>
                    {roleProfiles[value].name}
                  </option>
                ))}
              </select>
            </Field>
            {!creating && (
              <div className="field">
                <span>Access status</span>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={active}
                    disabled={action.busy || selected?.id === user.id}
                    onChange={(e) => setActive(e.target.checked)}
                  />{" "}
                  Active application access
                </label>
                <span className="hint">
                  You cannot deactivate yourself. The final active Super
                  administrator cannot be removed or demoted.
                </span>
              </div>
            )}
            <Field
              label="Reason for this change"
              hint="At least 10 characters; recorded in the audit trail."
            >
              <textarea
                required
                minLength={10}
                maxLength={2000}
                rows={3}
                value={reason}
                disabled={action.busy}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
            <div className="administration-form-footer">
              <p className="hint">
                {roleProfiles[role].purpose}{" "}
                {selected?.id === user.id && role !== user.role
                  ? "Your navigation will refresh to reflect your new role."
                  : ""}
              </p>
              <div className="actions">
                <button
                  className="primary"
                  disabled={action.busy || reason.trim().length < 10}
                >
                  {creating ? "Register access" : "Save access change"}
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={action.busy}
                  onClick={() => {
                    setSelected(null);
                    setCreating(false);
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          </form>
        </Panel>
      )}
    </>
  );
}
