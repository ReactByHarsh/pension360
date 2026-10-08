import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ChevronDown, RefreshCw, Sparkles } from "lucide-react";
import { api } from "./api";
import type { Answer, List, Member, User } from "./types";
import { AnswerView } from "./CopilotResponse";
import {
  assistantRequest,
  copilotPageLabels,
  mentionedMemberId,
  suggestionQuestion,
  suggestionsRequest,
  type CopilotForecast,
  type CopilotPage,
  type CopilotSuggestion,
  type CopilotSuggestions,
} from "./copilot-context";
import {
  ErrorBox,
  Field,
  KeyValues,
  ListMore,
  Loading,
  useResource,
} from "./ui";
import "./copilot-questions.css";

type PageContext = {
  memberId?: string;
  forecast?: CopilotForecast;
  page?: CopilotPage;
  setMemberId: (id: string | undefined) => void;
  setForecast: (value: CopilotForecast | undefined) => void;
  setPage: (value: CopilotPage | undefined) => void;
};
const Context = createContext<PageContext | null>(null);
export function CopilotProvider({ children }: { children: ReactNode }) {
  const [memberId, setMemberId] = useState<string>();
  const [forecast, setForecast] = useState<CopilotForecast>();
  const [page, setPage] = useState<CopilotPage>();
  return (
    <Context.Provider
      value={{ memberId, forecast, page, setMemberId, setForecast, setPage }}
    >
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
/** Allows a guided module to use the same contextual Copilot as the original screens. */
export function useCopilotPage(page?: CopilotPage) {
  const setPage = useContext(Context)?.setPage;
  useEffect(() => {
    setPage?.(page);
    return () => setPage?.(undefined);
  }, [setPage, page]);
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

type Evidence = {
  coverage: Record<string, unknown>;
  context: Record<string, unknown>;
  citations: Array<{ id: string; title: string }>;
  provider: string;
};
export function Copilot({
  page: basePage,
  mode: _mode,
  user,
  navigate,
  combined = false,
}: {
  page: CopilotPage;
  mode: "dev" | "oidc";
  user: User;
  navigate: (page: string) => void;
  combined?: boolean;
}) {
  const context = useContext(Context);
  const inheritedPage = context?.page || basePage;
  const [selection, setSelection] = useState({
    inheritedPage,
    page: inheritedPage,
  });
  const page =
    selection.inheritedPage === inheritedPage ? selection.page : inheritedPage;
  const [refresh, setRefresh] = useState(0);
  const members = useResource<List<Member>>("/members", refresh);
  const [question, setQuestion] = useState("");
  const [language, setLanguage] = useState<"en" | "ar">("en");
  const [chosenMember, setChosenMember] = useState("");
  const [selectedSuggestion, setSelectedSuggestion] = useState<string | null>(
    null,
  );
  const [ownForecast, setOwnForecast] = useState<CopilotForecast>({
    asOfDate: new Date().toISOString().slice(0, 10),
    horizonMonths: 12,
    delayMonths: 0,
  });
  const [answer, setAnswer] = useState<{ key: string; value: Answer } | null>(
    null,
  );
  const [evidence, setEvidence] = useState<{
    key: string;
    value: Evidence;
  } | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyKind, setBusyKind] = useState<"answer" | "evidence" | null>(null);
  const [suggestions, setSuggestions] = useState<{
    key: string;
    value: CopilotSuggestions;
  } | null>(null);
  const [suggestionsError, setSuggestionsError] = useState<Error | null>(null);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const inFlight = useRef<AbortController | null>(null);
  const requestNumber = useRef(0);
  const globalContext = page === "dashboard" || page === "forecast";
  const mentionedId = mentionedMemberId(
    question,
    members.data?.items.map((member) => member.id) ?? [],
  );
  // A question may focus an all-members view; it never changes an explicit page/member selection.
  const memberId = globalContext
    ? ""
    : context?.memberId || chosenMember || mentionedId || "";
  const forecast =
    page === "forecast"
      ? context?.forecast || (combined ? ownForecast : undefined)
      : undefined;
  const memberMismatch = Boolean(
    !globalContext && memberId && mentionedId && memberId !== mentionedId,
  );
  const selectedMember = members.data?.items.find(
    (member) => member.id === memberId,
  );
  const forecastReady =
    page !== "forecast" ||
    Boolean(
      forecast?.asOfDate &&
      Number.isInteger(forecast.delayMonths) &&
      forecast.delayMonths >= -60 &&
      forecast.delayMonths <= 60,
    );
  const scopeKey = JSON.stringify({
    userId: user.id,
    role: user.role,
    page,
    memberId,
    forecast,
    language,
    refresh,
  });
  const contextKey = JSON.stringify({ scopeKey, question });
  const currentSuggestions =
    suggestions?.key === scopeKey ? suggestions.value : null;
  const currentAnswer = answer?.key === contextKey ? answer.value : null;
  const currentEvidence = evidence?.key === contextKey ? evidence.value : null;
  const selectionScope = JSON.stringify({
    inheritedPage,
    page,
    memberId: context?.memberId,
    chosenMember,
    userId: user.id,
  });
  useEffect(() => {
    setQuestion("");
    setSelectedSuggestion(null);
  }, [selectionScope]);
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
  useEffect(() => {
    const onDataChanged = () => {
      setQuestion("");
      setSelectedSuggestion(null);
      setRefresh((value) => value + 1);
    };
    window.addEventListener("p360-data-changed", onDataChanged);
    return () => window.removeEventListener("p360-data-changed", onDataChanged);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setSuggestions(null);
    setSuggestionsError(null);
    if (!forecastReady) {
      setSuggestionsLoading(false);
      return () => controller.abort();
    }
    setSuggestionsLoading(true);
    api<CopilotSuggestions>(
      "/assistant/suggestions",
      suggestionsRequest(page, language, memberId, forecast),
      "POST",
      controller.signal,
    )
      .then((value) => {
        if (controller.signal.aborted) return;
        if (
          value.page !== page ||
          (value.memberId || "") !== memberId ||
          !Array.isArray(value.questions)
        )
          throw new Error(
            "Question suggestions did not match the selected context. Refresh to try again.",
          );
        setSuggestions({ key: scopeKey, value });
      })
      .catch((err) => {
        if (!controller.signal.aborted)
          setSuggestionsError(
            err instanceof Error ? err : new Error(String(err)),
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setSuggestionsLoading(false);
      });
    return () => controller.abort();
  }, [scopeKey, forecastReady]);

  function changePage(nextPage: CopilotPage) {
    setQuestion("");
    setSelectedSuggestion(null);
    setSelection({ inheritedPage, page: nextPage });
  }
  function refreshData() {
    setQuestion("");
    setSelectedSuggestion(null);
    setRefresh((value) => value + 1);
  }
  function choose(item: CopilotSuggestion) {
    if (!item.available) return;
    setSelectedSuggestion(item.id);
    setQuestion(suggestionQuestion(item, language));
  }
  async function request(kind: "answer" | "evidence") {
    if (
      busy ||
      memberMismatch ||
      !forecastReady ||
      (kind === "answer" &&
        (user.role === "AUDITOR" || question.trim().length < 5))
    )
      return;
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    const current = ++requestNumber.current;
    const key = contextKey;
    setBusy(true);
    setBusyKind(kind);
    setError(null);
    setAnswer(null);
    setEvidence(null);
    try {
      const body = assistantRequest(
        page,
        question.trim().length >= 5
          ? question
          : "Show the current evidence for this context.",
        language,
        memberId,
        forecast,
      );
      if (kind === "answer") {
        const value = await api<Answer>(
          "/assistant",
          body,
          "POST",
          controller.signal,
        );
        if (current === requestNumber.current && !controller.signal.aborted)
          setAnswer({ key, value });
      } else {
        const value = await api<Evidence>(
          "/assistant/context",
          body,
          "POST",
          controller.signal,
        );
        if (current === requestNumber.current && !controller.signal.aborted)
          setEvidence({ key, value });
      }
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
      aria-label={combined ? "Combined Copilot" : "Page Copilot"}
    >
      <details className="panel copilot-panel" open>
        <summary className="copilot-heading">
          <span>
            <Sparkles size={20} />
            <strong>
              {combined ? "Combined Pension Copilot" : "Pension Copilot"}
            </strong>
          </span>
          <span className="pill">{copilotPageLabels[page]}</span>
          <ChevronDown
            className="copilot-disclosure"
            size={18}
            aria-hidden="true"
          />
        </summary>
        <div className="panel-body">
          <p className="muted">
            Ask about the data saved in this system. Suggested questions below
            come from the current member, uploaded documents, assessments and
            other records. Answers use the evidence available when you ask and
            show their sources.
          </p>
          {combined && (
            <Field label="Copilot module">
              <select
                aria-label="Copilot module"
                value={page}
                onChange={(event) =>
                  changePage(event.target.value as CopilotPage)
                }
              >
                {Object.entries(copilotPageLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <p className="hint">
                Choose a module or Member overview for a combined view of the
                selected member’s available evidence.
              </p>
            </Field>
          )}
          {!combined && basePage === "readiness" && (
            <div className="tabs" aria-label="Copilot context">
              {(["readiness", "forecast"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  className={page === value ? "active" : ""}
                  aria-pressed={page === value}
                  onClick={() => changePage(value)}
                >
                  {value === "forecast"
                    ? "Forecast questions"
                    : "Readiness questions"}
                </button>
              ))}
            </div>
          )}
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
                    aria-label="Member context (optional)"
                    value={chosenMember}
                    onChange={(event) => {
                      setQuestion("");
                      setSelectedSuggestion(null);
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
                {!context?.memberId && !chosenMember && mentionedId && (
                  <p className="hint" role="status">
                    Member {mentionedId} was detected in your question. Copilot
                    will use this member’s saved evidence.
                  </p>
                )}
                {!context?.memberId && !chosenMember && !mentionedId && (
                  <p className="hint">
                    All members is selected. Choose a member for questions about
                    their records.
                  </p>
                )}
              </Field>
            )}
            <Field label="Response language">
              <select
                value={language}
                onChange={(event) => {
                  setLanguage(event.target.value as "en" | "ar");
                  setQuestion("");
                  setSelectedSuggestion(null);
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
          {page === "forecast" &&
            (combined && !context?.forecast ? (
              <div className="form-row">
                <Field label="Forecast as-of date">
                  <input
                    type="date"
                    value={ownForecast.asOfDate}
                    onChange={(event) => {
                      setQuestion("");
                      setSelectedSuggestion(null);
                      setOwnForecast((value) => ({
                        ...value,
                        asOfDate: event.target.value,
                      }));
                    }}
                  />
                </Field>
                <Field label="Forecast horizon">
                  <select
                    value={ownForecast.horizonMonths}
                    onChange={(event) => {
                      setQuestion("");
                      setSelectedSuggestion(null);
                      setOwnForecast((value) => ({
                        ...value,
                        horizonMonths: Number(event.target.value) as
                          12 | 36 | 60,
                      }));
                    }}
                  >
                    <option value={12}>12 months</option>
                    <option value={36}>36 months</option>
                    <option value={60}>60 months</option>
                  </select>
                </Field>
                <Field label="Forecast timing shift (months)">
                  <input
                    type="number"
                    min={-60}
                    max={60}
                    value={ownForecast.delayMonths}
                    onChange={(event) => {
                      setQuestion("");
                      setSelectedSuggestion(null);
                      setOwnForecast((value) => ({
                        ...value,
                        delayMonths: Number(event.target.value),
                      }));
                    }}
                  />
                </Field>
              </div>
            ) : (
              <div className="notice info">
                Current forecast controls:{" "}
                {forecast?.asOfDate || "not available"} ·{" "}
                {forecast?.horizonMonths} months · timing shift{" "}
                {forecast?.delayMonths} months. Adjust the forecast form above
                to change these assumptions.
              </div>
            ))}
          <div className="copilot-demo copilot-current-questions">
            <div className="copilot-demo-heading">
              <strong>Questions from current data</strong>
              <button type="button" className="secondary" onClick={refreshData}>
                <RefreshCw size={15} />
                Refresh data and questions
              </button>
            </div>
            <p className="hint">
              Click a question to prepare it, then choose Ask Copilot.
              Suggestions do not call AI or change your selected member.
            </p>
            {suggestionsLoading && (
              <Loading text="Reading current records for questions…" />
            )}
            <ErrorBox error={suggestionsError} />
            {!forecastReady && (
              <p className="hint">
                Set valid forecast controls to see questions based on that
                forecast.
              </p>
            )}
            {currentSuggestions && (
              <>
                <p className="hint">
                  Evidence checked:{" "}
                  {new Date(currentSuggestions.capturedAt).toLocaleString()} ·{" "}
                  {memberId ? `Member ${memberId}` : "All members / workspace"}
                </p>
                <div className="copilot-question-grid">
                  {currentSuggestions.questions.map((item) => (
                    <article
                      key={item.id}
                      className={`copilot-question-card ${item.available ? "" : "copilot-question-unavailable"}`}
                    >
                      <button
                        type="button"
                        className={`copilot-chip ${selectedSuggestion === item.id ? "active" : ""}`}
                        disabled={!item.available}
                        aria-pressed={selectedSuggestion === item.id}
                        onClick={() => choose(item)}
                      >
                        <strong>{item.label}</strong>
                        <span dir={language === "ar" ? "rtl" : "ltr"}>
                          {suggestionQuestion(item, language)}
                        </span>
                      </button>
                      {!item.available && (
                        <p className="hint">
                          <strong>Data needed:</strong>{" "}
                          {item.reason ||
                            "Complete the required data step first."}
                        </p>
                      )}
                      {item.evidenceRefs?.length > 0 && (
                        <details className="copilot-question-sources">
                          <summary>
                            {item.evidenceRefs.length} supporting record
                            {item.evidenceRefs.length === 1 ? "" : "s"}
                          </summary>
                          <ul>
                            {item.evidenceRefs.map((ref) => (
                              <li key={ref.id}>
                                {ref.title} <small>({ref.id})</small>
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                      {!item.available && item.nextPage && (
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => navigate(item.nextPage!)}
                        >
                          Open required data screen
                        </button>
                      )}
                    </article>
                  ))}
                </div>
                {!currentSuggestions.questions.length && (
                  <p>
                    No questions are available for this context yet. Add the
                    required data or choose another module.
                  </p>
                )}
                <details className="copilot-notes">
                  <summary>What data is available?</summary>
                  <KeyValues value={currentSuggestions.coverage} />
                </details>
              </>
            )}
          </div>
          <form
            className="stack"
            onSubmit={(event) => {
              event.preventDefault();
              void request("answer");
            }}
          >
            <Field label="Your question">
              <textarea
                rows={3}
                required
                minLength={5}
                maxLength={3000}
                dir={language === "ar" ? "rtl" : "ltr"}
                value={question}
                placeholder="Choose a question from your records or ask your own…"
                onChange={(event) => {
                  setQuestion(event.target.value);
                  setSelectedSuggestion(null);
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
                  !forecastReady
                }
              >
                <Sparkles size={16} />
                {busyKind === "answer" ? "Preparing response…" : "Ask Copilot"}
              </button>
              <span className="hint">
                {user.role === "AUDITOR"
                  ? "Your auditor role can inspect evidence; asking Copilot requires an operational role."
                  : memberMismatch
                    ? `This context is using ${memberId}, but your question mentions ${mentionedId}. Match the question to the selected member.`
                    : "Uses the configured AI provider only when you ask. Copilot does not approve or change records."}
              </span>
            </div>
          </form>
          <div className="top-gap">
            <button
              type="button"
              className="secondary"
              disabled={busy || memberMismatch || !forecastReady}
              onClick={() => void request("evidence")}
            >
              Preview current Copilot evidence
            </button>
            <p className="hint">
              Inspect the saved evidence before asking. This does not call AI.
              Refresh data and questions after uploading, syncing, assessing or
              verifying records.
            </p>
            {currentEvidence && (
              <div className="notice info" aria-live="polite">
                <strong>
                  Current evidence · provider: {currentEvidence.provider}
                </strong>
                <KeyValues value={currentEvidence.coverage} />
                <ul>
                  {currentEvidence.citations.map((c) => (
                    <li key={c.id}>
                      {c.title} <small>({c.id})</small>
                    </li>
                  ))}
                </ul>
                <details>
                  <summary>Inspect facts supplied to Copilot</summary>
                  <KeyValues value={currentEvidence.context} />
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
          {currentAnswer && (
            <div className="top-gap" aria-live="polite">
              <AnswerView answer={currentAnswer} />
            </div>
          )}
        </div>
      </details>
    </section>
  );
}
