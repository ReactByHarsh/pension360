import { useMemo, useState } from "react";
import { Pencil, Play, Plus, Save, Trash2 } from "lucide-react";
import { api } from "./api";
import {
  ErrorBox,
  Field,
  Loading,
  Notice,
  Panel,
  useAction,
  useResource,
} from "./ui";
import type { Source } from "./types";

type Entry = {
  key: string;
  builtin: boolean;
  name: string;
  description: string;
  method: "GET" | "POST";
  path: string;
  bindings: Source["bindings"];
  mode?: "static" | "member";
  statusCode?: number;
  response?: Record<string, unknown>;
};
type TryResult = {
  status: number;
  ok: boolean;
  ms: number;
  requestUrl: string;
  body: unknown;
};

const NEW_TEMPLATE = JSON.stringify(
  {
    memberId: "{{memberId}}",
    person: { dateOfBirth: "1965-03-15" },
    employment: { status: "ACTIVE", joiningDate: "1990-01-01" },
  },
  null,
  2,
);

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

// Lets a designer pick a fictional REST operation for a rule, try it live, and
// create or edit the demo operations themselves.
export function DemoApiPanel({
  source,
  editable,
  memberId,
  assessmentDate,
  onPick,
}: {
  source: Source;
  editable: boolean;
  memberId: string;
  assessmentDate: string;
  onPick: (entry: Entry) => void;
}) {
  const [refresh, setRefresh] = useState(0);
  const catalog = useResource<{ items: Entry[] }>("/demo-apis", refresh);
  const items = catalog.data?.items ?? [];
  const selected = items.find(
    (e) => e.path === source.path && e.method === source.method,
  );
  const [tryResult, setTryResult] = useState<TryResult | null>(null);
  const trying = useAction();
  const manage = useAction(() => setRefresh((n) => n + 1));
  const [editing, setEditing] = useState<"new" | string | null>(null);
  const [form, setForm] = useState({
    name: "",
    description: "",
    mode: "static" as "static" | "member",
    statusCode: "200",
    response: NEW_TEMPLATE,
  });
  const [jsonError, setJsonError] = useState("");
  const custom = items.filter((e) => !e.builtin);
  const editingEntry = useMemo(
    () => items.find((e) => e.key === `custom:${editing}`),
    [items, editing],
  );

  function startNew() {
    setEditing("new");
    setJsonError("");
    setForm({
      name: "",
      description: "",
      mode: "static",
      statusCode: "200",
      response: NEW_TEMPLATE,
    });
  }
  function startEdit(entry: Entry) {
    setEditing(entry.key.replace("custom:", ""));
    setJsonError("");
    setForm({
      name: entry.name,
      description: entry.description,
      mode: entry.mode ?? "static",
      statusCode: String(entry.statusCode ?? 200),
      response: JSON.stringify(entry.response ?? {}, null, 2),
    });
  }
  async function save() {
    let parsed: unknown;
    try {
      parsed = JSON.parse(form.response);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
        throw new Error("The response must be a JSON object, like { ... }");
    } catch (e) {
      setJsonError(
        `Response is not valid JSON: ${e instanceof Error ? e.message : String(e)}`,
      );
      return;
    }
    setJsonError("");
    const payload = {
      name: form.name,
      description: form.description,
      mode: form.mode,
      statusCode: Number(form.statusCode),
      response: parsed,
    };
    const ok = await manage.run(async () => {
      if (editing === "new")
        await api("/demo-apis", { ...payload, slug: slugify(form.name) });
      else await api(`/demo-apis/${editing}`, payload, "PUT");
      return true;
    }, editing === "new" ? "Demo API created. Pick it above to use it." : "Demo API saved.");
    if (ok) {
      const slug = editing === "new" ? slugify(form.name) : editing;
      setEditing(null);
      setTryResult(null);
      if (slug && editing === "new") {
        // Select it straight away so it can be tried.
        onPick({
          key: `custom:${slug}`,
          builtin: false,
          name: form.name,
          description: form.description,
          method: "GET",
          path: `/demo-source/custom/${slug}/{memberId}`,
          bindings: [
            { location: "path", key: "memberId", valueFrom: "memberId" },
          ],
        });
      }
    }
  }
  async function remove() {
    if (!editing || editing === "new") return;
    if (!window.confirm("Delete this demo API? Rules using it will fail until they use another path."))
      return;
    const ok = await manage.run(async () => {
      await api(`/demo-apis/${editing}`, undefined, "DELETE");
      return true;
    }, "Demo API deleted.");
    if (ok) setEditing(null);
  }

  return (
    <Panel title="Demo APIs">
      <p className="hint">
        Pick a ready-made fictional operation, try it, or create your own for
        the demo. Picking one fills the method, path and request bindings
        below.
      </p>
      {catalog.loading && <Loading text="Loading demo APIs…" />}
      <ErrorBox error={catalog.error} />
      <div className="form-grid">
        <Field
          label="Choose a demo API"
          info="Selecting an entry sets the method, the relative path and the request bindings for you. You can still edit them below afterwards."
        >
          <select
            disabled={!editable}
            value={selected?.key ?? ""}
            onChange={(e) => {
              const entry = items.find((x) => x.key === e.target.value);
              if (entry) {
                onPick(entry);
                setTryResult(null);
              }
            }}
          >
            <option value="">Custom path (not a demo API)</option>
            <optgroup label="Built-in">
              {items
                .filter((x) => x.builtin)
                .map((x) => (
                  <option key={x.key} value={x.key}>
                    {x.name}
                  </option>
                ))}
            </optgroup>
            {custom.length > 0 && (
              <optgroup label="Created for demos">
                {custom.map((x) => (
                  <option key={x.key} value={x.key}>
                    {x.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </Field>
      </div>
      {selected && (
        <p className="hint">
          <strong>
            {selected.method} {selected.path}
          </strong>
          {" — "}
          {selected.description}
        </p>
      )}
      <div className="actions">
        <button
          className="primary"
          disabled={trying.busy || !memberId}
          title={memberId ? undefined : "Choose a member first"}
          onClick={async () => {
            const result = await trying.run(
              () =>
                api<TryResult>("/demo-apis/try", {
                  method: source.method,
                  path: source.path,
                  memberId,
                  assessmentDate,
                }),
              "Request finished.",
            );
            if (result) setTryResult(result);
          }}
        >
          <Play size={16} />
          Try it now
        </button>
        {editable && (
          <button className="secondary" onClick={startNew}>
            <Plus size={16} />
            New demo API
          </button>
        )}
        {editable &&
          selected &&
          !selected.builtin && (
            <button
              className="secondary"
              onClick={() => startEdit(selected)}
            >
              <Pencil size={16} />
              Edit this API
            </button>
          )}
      </div>
      <ErrorBox error={trying.error} />
      {tryResult && (
        <div
          className={`notice ${tryResult.ok ? "success" : "error"}`}
          role="status"
        >
          <div style={{ width: "100%" }}>
            <strong>
              {tryResult.status === 0
                ? "No response"
                : `HTTP ${tryResult.status}`}{" "}
              · {tryResult.ms} ms
            </strong>
            <div className="hint">Request: {tryResult.requestUrl}</div>
            <pre className="json-out">
              {JSON.stringify(tryResult.body, null, 2)}
            </pre>
          </div>
        </div>
      )}
      <ErrorBox error={manage.error} />
      {!editing && <Notice>{manage.notice}</Notice>}
      {editing && (
        <div className="demo-api-editor">
          <h3>{editing === "new" ? "New demo API" : "Edit demo API"}</h3>
          <div className="form-grid">
            <Field
              label="Name"
              info="A short label shown in the dropdown. The address is generated from it, e.g. 'Early retirement' becomes /demo-source/custom/early-retirement/{memberId}."
            >
              <input
                value={form.name}
                disabled={editing !== "new" && !editingEntry}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
            <Field
              label="Behaviour"
              info="Static: always returns the JSON below. Member: starts from the stored fictional member (by id) and applies your JSON on top, so you can override just a date of birth."
            >
              <select
                value={form.mode}
                onChange={(e) =>
                  setForm({
                    ...form,
                    mode: e.target.value as "static" | "member",
                  })
                }
              >
                <option value="static">Static JSON</option>
                <option value="member">Member data with overrides</option>
              </select>
            </Field>
            <Field
              label="HTTP status"
              info="200 for success. Use 404, 500 or 503 to demonstrate how a rule reacts when the source fails (it reports UNABLE_TO_EVALUATE)."
            >
              <input
                type="number"
                min={200}
                max={599}
                value={form.statusCode}
                onChange={(e) =>
                  setForm({ ...form, statusCode: e.target.value })
                }
              />
            </Field>
            <Field
              label="Description"
              info="Explains to your audience what this operation stands for."
            >
              <input
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
              />
            </Field>
          </div>
          <Field
            label="Response JSON"
            info="The body returned to the rule. Use {{memberId}} and {{asOf}} as placeholders for the request values. Map its fields under Source & mapping using paths like /person/dateOfBirth."
          >
            <textarea
              className="json-editor"
              rows={10}
              spellCheck={false}
              value={form.response}
              onChange={(e) => setForm({ ...form, response: e.target.value })}
            />
          </Field>
          {jsonError && (
            <div className="notice error" role="alert">
              {jsonError}
            </div>
          )}
          <div className="actions">
            <button
              className="primary"
              disabled={manage.busy || !form.name.trim() || (editing === "new" && slugify(form.name).length < 2)}
              onClick={save}
            >
              <Save size={16} />
              Save demo API
            </button>
            <button className="secondary" onClick={() => setEditing(null)}>
              Cancel
            </button>
            {editing !== "new" && (
              <button
                className="secondary danger"
                disabled={manage.busy}
                onClick={remove}
              >
                <Trash2 size={16} />
                Delete
              </button>
            )}
          </div>
        </div>
      )}
    </Panel>
  );
}
