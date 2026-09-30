import { useEffect, useRef, useState } from "react";
import { Download, Save } from "lucide-react";
import { api } from "./api";
import { hasRole } from "./roles";
import type { CaseRecord, List, User } from "./types";
import {
  ErrorBox,
  Field,
  ListMore,
  Notice,
  Panel,
  useAction,
  useResource,
} from "./ui";

type ManagedCase = CaseRecord & {
  priority?: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  dueDate?: string | null;
  overdue?: boolean;
};
export function CaseManagement({
  caseRecord,
  user,
  onUpdated,
}: {
  caseRecord: ManagedCase;
  user: User;
  onUpdated: (value: CaseRecord) => void;
}) {
  const administrator = hasRole(user.role, "ADMIN");
  const canManage =
    administrator ||
    (user.role === "OFFICER" &&
      caseRecord.status !== "RESOLVED" &&
      (caseRecord.assignedTo === user.id || caseRecord.createdBy === user.id));
  const [assignedTo, setAssignedTo] = useState(caseRecord.assignedTo ?? ""),
    [priority, setPriority] = useState(caseRecord.priority ?? "NORMAL"),
    [dueDate, setDueDate] = useState(caseRecord.dueDate ?? ""),
    [reason, setReason] = useState("");
  const action = useAction(),
    generation = useRef(0);
  const users = useResource<List<{ id: string; name: string; role: string }>>(
    administrator ? "/users" : null,
  );
  useEffect(() => {
    generation.current++;
    setAssignedTo(caseRecord.assignedTo ?? "");
    setPriority(caseRecord.priority ?? "NORMAL");
    setDueDate(caseRecord.dueDate ?? "");
    setReason("");
    return () => {
      generation.current++;
    };
  }, [caseRecord.id, caseRecord.revision, user.id]);
  const changed =
    assignedTo !== (caseRecord.assignedTo ?? "") ||
    priority !== (caseRecord.priority ?? "NORMAL") ||
    dueDate !== (caseRecord.dueDate ?? "");
  return (
    <Panel title="Ownership, priority & deadline">
      <ErrorBox error={action.error || users.error} />
      <Notice>{action.notice}</Notice>
      <p className="hint">
        The due date includes the entire UTC day. A case becomes overdue on the
        following day while it remains active. These settings do not change
        evidence or independent-review requirements.
      </p>
      {caseRecord.overdue && (
        <div className="notice warning">
          This case is overdue. Record the follow-up or agree a revised deadline
          with a reason.
        </div>
      )}
      {canManage ? (
        <form
          className="form-grid"
          onSubmit={async (event) => {
            event.preventDefault();
            const current = generation.current;
            const change = {
              revision: caseRecord.revision,
              reason,
              ...(administrator && assignedTo !== (caseRecord.assignedTo ?? "")
                ? { assignedTo: assignedTo || null }
                : {}),
              ...(priority !== (caseRecord.priority ?? "NORMAL")
                ? { priority }
                : {}),
              ...(dueDate !== (caseRecord.dueDate ?? "")
                ? { dueDate: dueDate || null }
                : {}),
            };
            const result = await action.run(
              () =>
                api<CaseRecord>(
                  `/cases/${caseRecord.id}/management`,
                  change,
                  "PATCH",
                ),
              "Case settings saved and the change recorded.",
            );
            if (result && generation.current === current) onUpdated(result);
          }}
        >
          {administrator && (
            <Field label="Assigned colleague">
              <select
                value={assignedTo}
                onChange={(event) => setAssignedTo(event.target.value)}
              >
                <option value="">Unassigned</option>
                {assignedTo &&
                  !users.data?.items.some(
                    (person) => person.id === assignedTo,
                  ) && (
                    <option value={assignedTo}>
                      Current assignment · {assignedTo}
                    </option>
                  )}
                {users.data?.items.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name} · {person.role}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Priority">
            <select
              value={priority}
              onChange={(event) =>
                setPriority(
                  event.target.value as ManagedCase["priority"] & string,
                )
              }
            >
              {["LOW", "NORMAL", "HIGH", "URGENT"].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </Field>
          <Field label="Due date (UTC day)">
            <input
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
            />
          </Field>
          <Field label="Reason for this change">
            <textarea
              minLength={10}
              maxLength={2000}
              required
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </Field>
          <div>
            <button
              className="primary"
              disabled={action.busy || !changed || reason.trim().length < 10}
            >
              <Save size={16} /> Save case settings
            </button>
          </div>
        </form>
      ) : (
        <p>
          Assignee: {caseRecord.assignedTo || "Unassigned"} · Priority:{" "}
          {caseRecord.priority || "NORMAL"} · Due:{" "}
          {caseRecord.dueDate || "Not set"}. Administrators manage assignment;
          officers manage priority and deadlines on their own active cases.
        </p>
      )}
      {administrator && (
        <ListMore query={users} label="assignable colleagues" />
      )}
      {hasRole(user.role, "ADMIN", "OFFICER", "REVIEWER", "AUDITOR") && (
        <div className="actions top-gap">
          <button
            className="secondary"
            disabled={action.busy}
            onClick={async () => {
              const current = generation.current;
              const result = await action.run(
                () =>
                  api<{ filename: string; html: string }>(
                    `/cases/${caseRecord.id}/report?format=json`,
                  ),
                "Evidence report downloaded. Open it and use Print to save a PDF.",
              );
              if (!result || generation.current !== current) return;
              const url = URL.createObjectURL(
                  new Blob([result.html], { type: "text/html;charset=utf-8" }),
                ),
                anchor = document.createElement("a");
              anchor.href = url;
              anchor.download = result.filename;
              anchor.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            }}
          >
            <Download size={16} /> Download evidence report
          </button>
          <span className="hint">
            Printable HTML with saved assessments, verified member evidence and
            audit history.
          </span>
        </div>
      )}
    </Panel>
  );
}
