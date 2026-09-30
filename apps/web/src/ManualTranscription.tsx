import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import type { DocumentField, DocumentRecord, User } from "./types";
import { hasRole } from "./roles";
import { Field, ErrorBox, Notice, useAction } from "./ui";

type Props = {
  document: DocumentRecord;
  user: User;
  onUpdated: (doc: DocumentRecord) => void;
};
export function manualTranscriptionFields(fields: DocumentField[]) {
  return fields.length
    ? fields.map((field) => ({ ...field, evidence: { ...field.evidence } }))
    : [
        {
          name: "",
          value: "",
          evidence: { page: 1, quote: "" },
          uncertain: true,
        },
      ];
}
export function ManualTranscription(props: Props) {
  return (
    <TranscriptionForm
      key={`${props.document.id}:${props.document.revision}:${props.user.id}:${props.user.role}`}
      {...props}
    />
  );
}
function TranscriptionForm({ document, user, onUpdated }: Props) {
  const [fields, setFields] = useState<DocumentField[]>(() =>
    manualTranscriptionFields(document.fields),
  );
  const [reason, setReason] = useState("");
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const action = useAction();
  if (
    !hasRole(user.role, "ADMIN", "OFFICER", "REVIEWER") ||
    document.status === "VERIFIED" ||
    document.status === "PROCESSING"
  )
    return null;
  function update(index: number, patch: Partial<DocumentField>) {
    setFields(fields.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  }
  return (
    <details className="top-gap">
      <summary>Enter evidence manually from the original</summary>
      <p className="hint">
        Use this when AI extraction is unavailable or needs correction. This is
        human transcription, not an AI result. You and the uploader cannot
        verify these fields; another reviewer must compare them with the
        original. It does not change REST data or rule outcomes.
      </p>
      <ErrorBox error={action.error} />
      <Notice>{action.notice}</Notice>
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          if (action.busy) return;
          const result = await action.run(
            () =>
              api<DocumentRecord>(`/documents/${document.id}/transcribe`, {
                revision: document.revision,
                fields,
                reason,
              }),
            "Manual transcription saved for independent verification.",
          );
          if (result && mounted.current) onUpdated(result);
        }}
      >
        <fieldset
          disabled={action.busy}
          className="stack"
          style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
        >
          {fields.map((field, index) => (
            <fieldset key={index}>
              <legend>Evidence field {index + 1}</legend>
              <div className="form-grid">
                <Field label="Field name">
                  <input
                    required
                    maxLength={120}
                    value={field.name}
                    onChange={(e) => update(index, { name: e.target.value })}
                  />
                </Field>
                <Field label="Exact value">
                  <input
                    required
                    maxLength={4000}
                    value={field.value}
                    onChange={(e) => update(index, { value: e.target.value })}
                  />
                </Field>
                <Field label="Page number">
                  <input
                    type="number"
                    min={1}
                    max={10000}
                    required
                    value={field.evidence.page}
                    onChange={(e) =>
                      update(index, {
                        evidence: {
                          ...field.evidence,
                          page: Number(e.target.value),
                        },
                      })
                    }
                  />
                </Field>
                <Field label="Exact supporting quote">
                  <textarea
                    required
                    maxLength={1500}
                    value={field.evidence.quote}
                    onChange={(e) =>
                      update(index, {
                        evidence: { ...field.evidence, quote: e.target.value },
                      })
                    }
                  />
                </Field>
                <label>
                  <input
                    type="checkbox"
                    checked={field.uncertain}
                    onChange={(e) =>
                      update(index, { uncertain: e.target.checked })
                    }
                  />{" "}
                  Uncertain — reviewer must resolve
                </label>
              </div>
              <button
                type="button"
                className="text-button"
                disabled={fields.length === 1}
                onClick={() => setFields(fields.filter((_, i) => i !== index))}
              >
                Remove field
              </button>
            </fieldset>
          ))}
          <button
            type="button"
            className="secondary"
            disabled={fields.length >= 100}
            onClick={() =>
              setFields([
                ...fields,
                {
                  name: "",
                  value: "",
                  evidence: { page: 1, quote: "" },
                  uncertain: true,
                },
              ])
            }
          >
            Add evidence field
          </button>
          <Field label="Reason for manual transcription">
            <textarea
              required
              minLength={10}
              maxLength={2000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          <button className="primary" disabled={action.busy}>
            Save manual evidence for review
          </button>
        </fieldset>
      </form>
    </details>
  );
}
