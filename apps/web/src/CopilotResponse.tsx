import { ShieldCheck } from "lucide-react";
import type { Answer } from "./types";
import { Panel } from "./ui";
import { RichText } from "./RichText";

export function AnswerView({ answer }: { answer: Answer }) {
  return (
    <Panel
      title="Evidence-based explanation"
      aside={<span className="pill">{answer.provider}</span>}
    >
      <div className="ai-answer rich" dir="auto">
        <RichText text={answer.answer} />
      </div>
      {answer.evidenceCoverage && (
        <p className="hint">
          Context captured at{" "}
          {new Date(answer.evidenceCoverage.capturedAt).toLocaleString()}:{" "}
          {answer.evidenceCoverage.publishedPolicies} published policies ·{" "}
          {answer.evidenceCoverage.liveAssessments} saved live assessments ·{" "}
          {answer.evidenceCoverage.cases} cases ·{" "}
          {answer.evidenceCoverage.documents} document records. Asking Copilot
          does not run a new rules assessment.
        </p>
      )}
      <div className="notice info">
        <ShieldCheck size={17} />
        Human review required. Verify the cited records before relying on this
        explanation.
      </div>
      <details open>
        <summary>Source citations</summary>
        {answer.citations?.length ? (
          <ol className="copilot-citations">
            {answer.citations.map((value, index) => {
              const citation =
                value && typeof value === "object"
                  ? (value as Record<string, unknown>)
                  : {};
              return (
                <li key={index}>
                  <strong>
                    {typeof citation.title === "string"
                      ? citation.title
                      : "Supporting evidence"}
                  </strong>
                  {typeof citation.id === "string" && (
                    <details>
                      <summary>Reference ID</summary>
                      <code>{citation.id}</code>
                    </details>
                  )}
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="muted">No source citations were returned.</p>
        )}
      </details>
    </Panel>
  );
}
