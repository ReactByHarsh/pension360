import {
  DecisionGraph,
  GraphSimulator,
  JdmConfigProvider,
  type DecisionGraphRef,
  type Simulation,
} from "@gorules/jdm-editor";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
} from "react";
import { Play } from "lucide-react";
import { api } from "./api";
import { RuleAssistant } from "./RuleAssistant";
import { ConfigProvider, theme } from "antd";
import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import JsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import CssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import HtmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";
import TsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";
import "@gorules/jdm-editor/dist/style.css";
import type { Graph, Mapping } from "./types";
import { createGraphSync, type GraphEditorHandle } from "./graph-sync";

// Keep every editor asset inside this deployment, including air-gapped deployments.
self.MonacoEnvironment = {
  getWorker(_id, language) {
    if (language === "json") return new JsonWorker();
    if (["css", "scss", "less"].includes(language)) return new CssWorker();
    if (["html", "handlebars", "razor"].includes(language))
      return new HtmlWorker();
    if (["typescript", "javascript"].includes(language)) return new TsWorker();
    return new EditorWorker();
  },
};
loader.config({ monaco });

export default forwardRef<
  GraphEditorHandle,
  {
    value: Graph;
    onChange: (graph: Graph) => void;
    onPendingChange: (pending: boolean) => void;
    disabled: boolean;
    dark: boolean;
    mappings?: Mapping[];
  }
>(function GraphEditor(
  { value, onChange, onPendingChange, disabled, dark, mappings = [] },
  ref,
) {
  const [simulate, setSimulate] = useState<Simulation | undefined>();
  const [running, setRunning] = useState(false);
  const [guide, setGuide] = useState("");
  const sampleRequest = useMemo(() => {
    const context: Record<string, unknown> = {};
    for (const m of mappings) {
      const sample =
        m.transform === "ageYears"
          ? 60
          : m.transform === "serviceYears"
            ? 30
            : m.type === "number"
              ? 0
              : m.type === "boolean"
                ? true
                : m.type === "date"
                  ? "1970-01-01"
                  : "sample";
      // Dotted names such as member.name are nested objects in the rule input.
      const parts = m.targetPath.split(".").filter(Boolean);
      let cursor = context;
      parts.forEach((part, index) => {
        if (index === parts.length - 1) cursor[part] = sample;
        else {
          const next = cursor[part];
          cursor[part] =
            next && typeof next === "object" ? next : {};
          cursor = cursor[part] as Record<string, unknown>;
        }
      });
    }
    return JSON.stringify(
      Object.keys(context).length ? context : { dateOfBirth: "1970-01-01" },
      null,
      2,
    );
  }, [mappings]);
  const runSimulator = useCallback(
    async ({ graph, context }: { graph: unknown; context: unknown }) => {
      setRunning(true);
      try {
        const out = await api<{
          ok: boolean;
          result?: Record<string, unknown>;
          trace?: Record<string, unknown>;
          performance?: string;
          error?: { title: string; message: string };
        }>("/rule-simulator/run", { graph, context });
        setSimulate(
          out.ok
            ? ({
                result: {
                  performance: out.performance ?? "",
                  result: out.result ?? {},
                  trace: out.trace ?? {},
                  snapshot: graph,
                },
              } as unknown as Simulation)
            : ({
                error: {
                  title: out.error?.title ?? "Run failed",
                  message:
                    out.error?.message ?? "The decision could not be run.",
                  data: {},
                },
              } as Simulation),
        );
      } catch (error) {
        setSimulate({
          error: {
            title: "Run failed",
            message: error instanceof Error ? error.message : String(error),
            data: {},
          },
        } as Simulation);
      } finally {
        setRunning(false);
      }
    },
    [],
  );
  const panels = useMemo(
    () => [
      {
        id: "simulator",
        title: "Run & test",
        icon: <Play size={16} />,
        renderPanel: () => (
          <GraphSimulator
            defaultRequest={sampleRequest}
            loading={running}
            onRun={runSimulator}
            onClear={() => setSimulate(undefined)}
          />
        ),
      },
    ],
    [sampleRequest, running, runSimulator],
  );
  const editor = useRef<DecisionGraphRef>(null);
  const latest = useRef({ value, onChange, onPendingChange, disabled });
  latest.current = { value, onChange, onPendingChange, disabled };
  const sync = useRef<ReturnType<typeof createGraphSync> | null>(null);
  useEffect(() => {
    const boundary = createGraphSync({
      initial: latest.current.value,
      read: () =>
        (editor.current?.stateStore.getState()
          .decisionGraph as unknown as Graph) || latest.current.value,
      onGraph: (graph) => latest.current.onChange(graph),
      onPending: (pending) => latest.current.onPendingChange(pending),
    });
    sync.current = boundary;
    return () => {
      boundary.dispose();
      if (sync.current === boundary) sync.current = null;
    };
  }, []);
  useEffect(() => {
    sync.current?.accept(value);
  }, [value]);
  useImperativeHandle(
    ref,
    () => ({
      snapshot: () =>
        sync.current?.snapshot() ||
        Promise.reject(new Error("The decision editor is still loading.")),
    }),
    [],
  );
  function captureActivity() {
    if (!latest.current.disabled) sync.current?.activity();
  }
  return (
    <>
      <div className="rule-guide">
        <label>
          <span>Need help? Choose what you want to do</span>
          <select value={guide} onChange={(e) => setGuide(e.target.value)}>
            <option value="">How do I…?</option>
            {GUIDE.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="primary"
          onClick={() => {
            const store = editor.current?.stateStore;
            if (!store) return;
            const open = store.getState().activePanel === "simulator";
            store.setState({ activePanel: open ? undefined : "simulator" });
          }}
        >
          <Play size={15} />
          Run &amp; test this rule
        </button>
        {GUIDE.filter((g) => g.id === guide).map((g) => (
          <ol key={g.id} className="rule-guide-steps">
            {g.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        ))}
      </div>
      <RuleAssistant
        disabled={disabled}
        availableInputs={mappings.map((m) => m.targetPath)}
        getGraph={() =>
          sync.current?.snapshot() ||
          Promise.reject(new Error("The decision editor is still loading."))
        }
        onApply={(graph) => {
          onChange(graph);
        }}
      />
      <div className="notice warning">
        <strong>Supported blocks:</strong>
        <span>
          Input, expression, decision table, switch and output. Function and
          external decision blocks are not supported and the server will reject
          models containing them.
        </span>
      </div>
      <ConfigProvider
        theme={{
          algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm,
          token: { colorPrimary: "#6555ef", borderRadius: 8 },
        }}
      >
        <JdmConfigProvider>
          <div
            className="graph-canvas"
            data-testid="jdm-editor"
            onInputCapture={captureActivity}
            onChangeCapture={captureActivity}
            onPointerUpCapture={captureActivity}
            onDropCapture={captureActivity}
          >
            <DecisionGraph
              ref={editor}
              value={value as ComponentProps<typeof DecisionGraph>["value"]}
              disabled={disabled}
              panels={panels}
              simulate={simulate}
              onChange={() => { if (!latest.current.disabled) sync.current?.changed(); }}
            />
          </div>
        </JdmConfigProvider>
      </ConfigProvider>
    </>
  );
});

const GUIDE: Array<{ id: string; title: string; steps: string[] }> = [
  {
    id: "dob",
    title: "Add date of birth (or any input) to a rule",
    steps: [
      "Open Source & mapping and add a field mapping, for example source /person/dateOfBirth to decision input name member.dateOfBirth, and pick a type (date, number, text).",
      "Back on the canvas, the mapped names are listed above it. Use exactly that name in your conditions, for example member.dateOfBirth (a date) or an age in years.",
      "Use the transform Completed years to turn a date of birth into an age you can compare with numbers.",
    ],
  },
  {
    id: "row",
    title: "Add a row to a decision table",
    steps: [
      "Double-click the decision table node (or click its edit icon) to open it.",
      "Click the + button under the last row, or right-click a row and choose Add row above / below.",
      "Fill the input cells with a condition (for example >= 60) and the output cell with the result (for example \"READY\").",
    ],
  },
  {
    id: "condition",
    title: "Add or change a condition (column)",
    steps: [
      "Open the decision table node and click + at the right end of the header to add an input column.",
      "In the header, type the field name (for example member.dateOfBirth) and, in each row, the condition: >= 60, < 55, [55..59], \"active\".",
      "Leave a cell empty to mean any value. Rows are checked top to bottom.",
    ],
  },
  {
    id: "output",
    title: "Change the result a row returns",
    steps: [
      "Open the decision table and edit the output column cells; quote text values, e.g. \"UNABLE_TO_EVALUATE\".",
      "Use the output column name your Output node expects (for example status or reason).",
    ],
  },
  {
    id: "run",
    title: "Run my rule and see the output",
    steps: [
      "Click the play button in the right-hand toolbar (Run & test).",
      "Edit the JSON request on the left, for example {\"dateOfBirth\": \"1962-04-01\", \"ageYears\": 63}.",
      "Press Run. The result appears on the right; the trace shows which table row matched. Any error is shown with its message.",
      "This scratch run does not save anything. Use Save, then the scenario tests, to keep your changes.",
    ],
  },
];
