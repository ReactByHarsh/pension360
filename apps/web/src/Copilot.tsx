import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ChevronDown, Sparkles } from "lucide-react";
import { api } from "./api";
import type { Answer, List, Member, User } from "./types";
import { AnswerView } from "./CopilotResponse";
import {
  assistantRequest,
  mentionedMemberId,
  selectDemoQuestion,
  type CopilotForecast,
  type CopilotPage,
  type DemoCatalog,
  type DemoQuestion,
} from "./copilot-context";
import {
  ErrorBox,
  Field,
  KeyValues,
  ListMore,
  Loading,
  Refresh,
  useResource,
} from "./ui";

type PageContext = {
  memberId?: string;
  forecast?: CopilotForecast;
  setMemberId: (id: string | undefined) => void;
  setForecast: (value: CopilotForecast | undefined) => void;
};
const Context = createContext<PageContext | null>(null);
export function CopilotProvider({ children }: { children: ReactNode }) {
  const [memberId, setMemberId] = useState<string>();
  const [forecast, setForecast] = useState<CopilotForecast>();
  return (
    <Context.Provider value={{ memberId, forecast, setMemberId, setForecast }}>
      {children}
    </Context.Provider>
  );
}
export function useCopilotMember(memberId?: string) {
  const setMemberId = useContext(Context)?.setMemberId;
  useEffect(() => {
    setMemberId?.(memberId || undefined);
    return () => setMemberId?.(undefined);
  }, [setMemberId, memberId]);
}
export function useCopilotForecast(forecast: CopilotForecast) {
  const setForecast = useContext(Context)?.setForecast;
  useEffect(() => {
    setForecast?.(forecast);
    return () => setForecast?.(undefined);
  }, [
    setForecast,
    forecast.asOfDate,
    forecast.horizonMonths,
    forecast.delayMonths,
  ]);
}

export function Copilot({
  page: basePage,
  mode,
  user,
  navigate,
}: {
  page: CopilotPage;
  mode: "dev" | "oidc";
  user: User;
  navigate: (page: string) => void;
}) {
  const context = useContext(Context);
  const [page, setPage] = useState(basePage);
  const [refresh, setRefresh] = useState(0);
  const catalog = useResource<DemoCatalog>(
    mode === "dev" ? "/demo/copilot" : null,
    refresh,
  );
  const members = useResource<List<Member>>("/members");
  const [question, setQuestion] = useState("");
  const [language, setLanguage] = useState<"en" | "ar">("en");
  const [chosenMember, setChosenMember] = useState("");
  const autoDetectedMember = useRef("");
  const [sample, setSample] = useState<DemoQuestion | null>(null);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [evidence, setEvidence] = useState<{
    coverage: Record<string, unknown>;
    context: Record<string, unknown>;
    citations: Array<{ id: string; title: string }>;
    provider: string;
  } | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyKind, setBusyKind] = useState<"answer" | "evidence" | null>(null);
  const inFlight = useRef<AbortController | null>(null);
  const requestNumber = useRef(0);
  const globalContext = page === "dashboard" || page === "forecast";
  const memberId = globalContext ? "" : context?.memberId || chosenMember;
  const forecast = page === "forecast" ? context?.forecast : undefined;
  const contextKey = JSON.stringify({
    userId: user.id,
    role: user.role,
    page,
    memberId,
    forecast,
    language,
    question,
  });
  useEffect(() => {
    requestNumber.current++;
    inFlight.current?.abort();
    setAnswer(null);
    setEvidence(null);
    setError(null);
    setBusy(false);
    setBusyKind(null);
    return () => {
      requestNumber.current++;
      inFlight.current?.abort();
    };
  }, [contextKey]);
  const demoPage = catalog.data?.pages.find((entry) => entry.id === page);
  const mentionedId = mentionedMemberId(
    question,
    members.data?.items.map((member) => member.id) ?? [],
  );
  const memberMismatch = Boolean(
    (sample?.memberId && memberId && sample.memberId !== memberId) ||
    (context?.memberId && mentionedId && context.memberId !== mentionedId),
  );
  const selectedMember = members.data?.items.find(
    (member) => member.id === memberId,
  );
  const memberStory = catalog.data?.members.find(
    (member) => member.id === memberId,
  );
  function choose(sample: DemoQuestion, nextLanguage = language) {
    autoDetectedMember.current = "";
    const next = selectDemoQuestion(
      sample,
      nextLanguage,
      context?.memberId,
      chosenMember,
    );
    setSample(sample);
    setQuestion(next.question);
    setChosenMember(next.memberId);
  }
  async function ask() {
    if (
      busy ||
      memberMismatch ||
      user.role === "AUDITOR" ||
      question.trim().length < 5 ||
      (page === "forecast" && !forecast)
    )
      return;
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    const current = ++requestNumber.current;
    setBusy(true);
    setBusyKind("answer");
    setError(null);
    setAnswer(null);
    setEvidence(null);
    try {
      const result = await api<Answer>(
        "/assistant",
        assistantRequest(page, question, language, memberId, forecast),
        "POST",
        controller.signal,
      );
      if (current === requestNumber.current && !controller.signal.aborted)
        setAnswer(result);
    } catch (err) {
      if (current === requestNumber.current && !controller.signal.aborted)
        setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      if (current === requestNumber.current) {
        setBusy(false);
        setBusyKind(null);
      }
    }
  }
  return (
    <section
      className="copilot-section"
      id="pension-copilot"
      aria-label="Page Copilot"
    >
      <details className="panel copilot-panel" open>
        <summary className="copilot-heading">
          <span>
            <Sparkles size={20} />
            <strong>Pension Copilot</strong>
          </span>
          <span className="pill">
            {demoPage?.title || page.replace(/^./, (s) => s.toUpperCase())}
          </span>
          <ChevronDown
            className="copilot-disclosure"
            size={18}
            aria-hidden="true"
          />
        </summary>
        <div className="panel-body">
          <p className="muted">
            Ask about this page using saved workspace records and published
            policies. Leave the member context on All members for a workspace
            view, or choose one member for a focused answer. Copilot does not
            search the internet, approve benefits or change source records.
          </p>
          {basePage === "readiness" && (
            <div className="tabs" aria-label="Copilot context">
              {(["readiness", "forecast"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  className={page === value ? "active" : ""}
                  aria-pressed={page === value}
                  onClick={() => {
                    setPage(value);
                    setSample(null);
                    setQuestion("");
                  }}
                >
                  {value === "forecast"
                    ? "Forecast questions"
                    : "Readiness questions"}
                </button>
              ))}
            </div>
          )}
          {mode === "dev" && (
            <div className="copilot-demo">
              <div className="copilot-demo-heading">
                <span className="pill">Fictional demo scenarios</span>
                <Refresh onClick={() => setRefresh((value) => value + 1)} />
              </div>
              {catalog.loading ? (
                <Loading text="Loading sample questions…" />
              ) : (
                <>
                  <ErrorBox error={catalog.error} />
                  {catalog.data && (
                    <>
                      <p className="hint">
                        Demo reference date: {catalog.data.asOfDate}.{" "}
                        {catalog.data.policyStatus.published} published demo
                        policies; {catalog.data.policyStatus.draft} awaiting
                        review.
                      </p>
                      {catalog.data.policyStatus.draft > 0 && (
                        <div className="notice warning">
                          <div>
                            Before policy-grounded questions, an independent
                            reviewer must publish the relevant drafts.{" "}
                            <button
                              type="button"
                              className="text-button"
                              onClick={() => navigate("policy")}
                            >
                              Open Policy intelligence
                            </button>{" "}
                            Refresh this setup status afterward.
                          </div>
                        </div>
                      )}
                      <div className="copilot-chips">
                        {demoPage?.questions.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            className={`copilot-chip ${sample?.id === item.id ? "active" : ""}`}
                            aria-pressed={sample?.id === item.id}
                            onClick={() => choose(item)}
                          >
                            <span>{item.label}</span>
                            {item.memberId && (
                              <small>Suggested member: {item.memberId}</small>
                            )}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}
              {sample && (
                <>
                  <p className="hint">
                    <strong>Before asking:</strong> {sample.prerequisite}
                  </p>
                  {memberMismatch && (
                    <div className="notice warning">
                      This sample suggests {sample.memberId}; your current
                      context remains {memberId}. Select the suggested member on
                      the page or choose a matching sample. The sample’s
                      expected result may not apply to your current member.
                    </div>
                  )}
                  <details className="copilot-notes">
                    <summary>
                      Presenter notes · expected discussion, not an AI response
                    </summary>
                    <p>{sample.expected}</p>
                    {memberStory && (
                      <p>
                        <strong>{memberStory.id}:</strong> {memberStory.story}
                      </p>
                    )}
                  </details>
                </>
              )}
            </div>
          )}
          <form
            className="stack"
            onSubmit={(event) => {
              event.preventDefault();
              void ask();
            }}
          >
            <div className="form-row">
              {!globalContext && (
                <Field
                  label={
                    context?.memberId
                      ? "Member selected on this page"
                      : "Member context (optional)"
                  }
                >
                  {context?.memberId ? (
                    <div className="copilot-context">
                      {memberId}
                      {selectedMember ? ` · ${selectedMember.name}` : ""}
                      <small>
                        Change the page selection to use a different member.
                      </small>
                    </div>
                  ) : (
                    <select
                      value={chosenMember}
                      onChange={(event) => {
                        autoDetectedMember.current = "";
                        setChosenMember(event.target.value);
                      }}
                    >
                      <option value="">All members (default)</option>
                      {members.data?.items.map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.id} · {member.name}
                        </option>
                      ))}
                    </select>
                  )}
                  {!context?.memberId && mentionedId === chosenMember && (
                    <p className="hint" role="status">
                      Member {mentionedId} was detected in your question.
                      Copilot will use this member’s saved evidence.
                    </p>
                  )}
                  {!context?.memberId && !chosenMember && (
                    <p className="hint">
                      All members is selected. Ask for a workspace-wide list or
                      summary, or mention one member ID to focus the answer.
                    </p>
                  )}
                </Field>
              )}
              <Field label="Response language">
                <select
                  value={language}
                  onChange={(event) => {
                    const value = event.target.value as "en" | "ar";
                    setLanguage(value);
                    if (sample) choose(sample, value);
                  }}
                >
                  <option value="en">English</option>
                  <option value="ar">العربية</option>
                </select>
              </Field>
            </div>
            {!globalContext && (
              <>
                <ErrorBox error={members.error} />
                {!context?.memberId && (
                  <ListMore query={members} label="member choices" />
                )}
              </>
            )}
            {page === "forecast" && (
              <div className="notice info">
                Current forecast controls:{" "}
                {forecast?.asOfDate || "not available"} ·{" "}
                {forecast?.horizonMonths} months · timing shift{" "}
                {forecast?.delayMonths} months. Adjust the forecast form above
                to change these assumptions.
              </div>
            )}
            <Field label="Your question">
              <textarea
                rows={3}
                required
                minLength={5}
                maxLength={3000}
                dir={language === "ar" ? "rtl" : "ltr"}
                value={question}
                placeholder="Choose a sample question or ask your own…"
                onChange={(event) => {
                  const nextQuestion = event.target.value;
                  setQuestion(nextQuestion);
                  setSample(null);
                  if (!context?.memberId) {
                    const detected = mentionedMemberId(
                      nextQuestion,
                      members.data?.items.map((member) => member.id) ?? [],
                    );
                    if (detected) {
                      autoDetectedMember.current = detected;
                      setChosenMember(detected);
                    } else if (autoDetectedMember.current) {
                      const previouslyDetected = autoDetectedMember.current;
                      autoDetectedMember.current = "";
                      setChosenMember((current) =>
                        current === previouslyDetected ? "" : current,
                      );
                    }
                  }
                }}
              />
            </Field>
            <div className="copilot-ask">
              <button
                type="submit"
                className="primary"
                disabled={
                  busy ||
                  memberMismatch ||
                  question.trim().length < 5 ||
                  user.role === "AUDITOR" ||
                  (page === "forecast" && !forecast)
                }
              >
                <Sparkles size={16} />
                {busyKind === "answer" ? "Preparing response…" : "Ask Copilot"}
              </button>
              <span className="hint">
                {user.role === "AUDITOR"
                  ? "Your auditor role can inspect records; asking Copilot requires an operational role."
                  : memberMismatch
                    ? context?.memberId && mentionedId !== context.memberId
                      ? `This page is using ${context.memberId}, but your question mentions ${mentionedId}. Match the question to this page's member.`
                      : "Match the sample member, or edit the question for your current context."
                    : "Uses the configured AI provider only when you ask."}
              </span>
            </div>
          </form>
          <div className="top-gap">
            <button
              type="button"
              className="secondary"
              disabled={
                busy || memberMismatch || (page === "forecast" && !forecast)
              }
              onClick={async () => {
                const current = ++requestNumber.current;
                inFlight.current?.abort();
                const controller = new AbortController();
                inFlight.current = controller;
                setBusy(true);
                setBusyKind("evidence");
                setError(null);
                setEvidence(null);
                setAnswer(null);
                try {
                  const result = await api<NonNullable<typeof evidence>>(
                    "/assistant/context",
                    assistantRequest(
                      page,
                      question.trim().length >= 5
                        ? question
                        : "Show the current evidence for this context.",
                      language,
                      memberId,
                      forecast,
                    ),
                    "POST",
                    controller.signal,
                  );
                  if (
                    current === requestNumber.current &&
                    !controller.signal.aborted
                  )
                    setEvidence(result);
                } catch (err) {
                  if (
                    current === requestNumber.current &&
                    !controller.signal.aborted
                  )
                    setError(err as Error);
                } finally {
                  if (current === requestNumber.current) {
                    setBusy(false);
                    setBusyKind(null);
                  }
                }
              }}
            >
              Preview current Copilot evidence
            </button>
            <p className="hint">
              Shows the saved evidence available for this context. This does not
              call the AI provider or generate an answer. Refresh after syncing,
              assessing or verifying documents.
            </p>
            {evidence && (
              <div className="notice info" aria-live="polite">
                <strong>
                  Current evidence · provider: {evidence.provider}
                </strong>
                <KeyValues value={evidence.coverage} />
                <ul>
                  {evidence.citations.map((c) => (
                    <li key={c.id}>
                      {c.title} <small>({c.id})</small>
                    </li>
                  ))}
                </ul>
                <details>
                  <summary>Inspect facts supplied to Copilot</summary>
                  <KeyValues value={evidence.context} />
                </details>
              </div>
            )}
          </div>
          <ErrorBox error={error} />
          {busy && (
            <Loading
              text={
                busyKind === "evidence"
                  ? "Reading current saved evidence; no AI request is sent…"
                  : "Reading authorized context and preparing an answer…"
              }
            />
          )}
          {answer && (
            <div className="top-gap" aria-live="polite">
              <AnswerView answer={answer} />
            </div>
          )}
        </div>
      </details>
    </section>
  );
}
