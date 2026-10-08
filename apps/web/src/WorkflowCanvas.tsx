import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Maximize2, Minus, Plus } from "lucide-react";
import "bpmn-js/dist/assets/diagram-js.css";
import "bpmn-js/dist/assets/bpmn-font/css/bpmn.css";
import { ErrorBox } from "./ui";

// BPMN's model and services are extensible objects. Keep that API boundary here.
export type BpmnNode = {
  id: string;
  type: string;
  businessObject: {
    id: string;
    name?: string;
    $type: string;
    body?: string;
    conditionExpression?: { body?: string };
    sourceRef?: { id: string; $type: string; default?: { id: string } };
    default?: { id: string };
    outgoing?: Array<{ id: string; name?: string }>;
  };
};
type CanvasApi = {
  importXML: (xml: string) => Promise<unknown>;
  saveXML: (options: { format: boolean }) => Promise<{ xml?: string }>;
  destroy: () => void;
  on: (event: string, callback: (event: any) => void) => void;
  get: (name: string) => any;
};
function fitDiagram(api: CanvasApi, editable: boolean) {
  const canvas = api.get("canvas");
  canvas.zoom("fit-viewport", "auto");
  const box = canvas.viewbox();
  // Leave breathing room around the diagram and the overlaid BPMN palette.
  const leftPadding = editable ? 170 : 25;
  canvas.viewbox({ x: box.x - leftPadding / box.scale, y: box.y - 25 / box.scale, width: box.width + (leftPadding + 45) / box.scale, height: box.height + 50 / box.scale });
}
export type WorkflowCanvasHandle = {
  getXml: () => Promise<string>;
  getNodes: () => BpmnNode[];
  select: (id: string) => void;
  setName: (id: string, name: string) => void;
  setTaskType: (id: string, type: string) => void;
  setDefault: (gatewayId: string, flowId: string) => void;
  setCondition: (flowId: string, condition: { path: string; operator: string; value: string } | null) => void;
};

export default forwardRef<WorkflowCanvasHandle, {
  xml: string;
  editable: boolean;
  onSelect: (node: BpmnNode | null) => void;
  onChange: () => void;
  onReady?: () => void;
  activeNodeId?: string | null;
}>(function WorkflowCanvas({ xml, editable, onSelect, onChange, onReady, activeNodeId }, ref) {
  const host = useRef<HTMLDivElement>(null);
  const modeler = useRef<CanvasApi | null>(null);
  const callbacks = useRef({ onSelect, onChange, onReady });
  callbacks.current = { onSelect, onChange, onReady };
  const [error, setError] = useState<Error | null>(null);
  const [ready, setReady] = useState(false);
  const [generation, setGeneration] = useState(0);
  useEffect(() => {
    let disposed = false;
    let instance: CanvasApi | null = null;
    setReady(false);
    setError(null);
    const start = async () => {
      try {
        const module = editable ? await import("bpmn-js/lib/Modeler") : await import("bpmn-js/lib/NavigatedViewer");
        if (disposed || !host.current) return;
        instance = new module.default({ container: host.current }) as unknown as CanvasApi;
        modeler.current = instance;
        instance.on("selection.changed", event => callbacks.current.onSelect(event.newSelection?.[0] || null));
        await instance.importXML(xml);
        if (disposed) return;
        fitDiagram(instance, editable);
        instance.on("commandStack.changed", () => callbacks.current.onChange());
        setReady(true);
        setGeneration(n => n + 1);
        callbacks.current.onReady?.();
      } catch (cause) {
        if (!disposed) setError(cause instanceof Error ? cause : new Error(String(cause)));
      }
    };
    void start();
    return () => {
      disposed = true;
      instance?.destroy();
      if (modeler.current === instance) modeler.current = null;
    };
  }, [xml, editable]);
  useEffect(() => {
    const api = modeler.current;
    if (!ready || !activeNodeId || !api?.get("elementRegistry").get(activeNodeId)) return;
    const canvas = api.get("canvas");
    canvas.addMarker(activeNodeId, "workflow-current");
    return () => { try { canvas.removeMarker(activeNodeId, "workflow-current"); } catch { /* Diagram was replaced. */ } };
  }, [activeNodeId, ready, generation]);
  useImperativeHandle(ref, () => ({
    async getXml() {
      if (!modeler.current || !ready || error) throw new Error("Wait until the workflow diagram has loaded successfully.");
      const result = await modeler.current.saveXML({ format: true });
      if (!result.xml) throw new Error("The diagram could not be exported.");
      return result.xml;
    },
    getNodes: () => modeler.current?.get("elementRegistry").getAll().filter((node: BpmnNode) => node.type !== "label") || [],
    select(id) {
      const node = modeler.current?.get("elementRegistry").get(id);
      if (node) modeler.current?.get("selection").select(node);
    },
    setName(id, name) {
      const api = modeler.current;
      if (!api || !editable) return;
      const node = api.get("elementRegistry").get(id);
      if (node) api.get("modeling").updateProperties(node, { name });
    },
    setTaskType(id, type) {
      const api = modeler.current;
      if (!api || !editable || !["bpmn:UserTask", "bpmn:BusinessRuleTask"].includes(type)) return;
      const node = api.get("elementRegistry").get(id);
      if (node) {
        const replacement = api.get("bpmnReplace").replaceElement(node, { type });
        api.get("selection").select(replacement);
      }
    },
    setDefault(gatewayId, flowId) {
      const api = modeler.current;
      if (!api || !editable) return;
      const registry = api.get("elementRegistry");
      const gateway = registry.get(gatewayId), flow = registry.get(flowId);
      if (!gateway || !flow) return;
      api.get("modeling").updateProperties(flow, { conditionExpression: undefined });
      api.get("modeling").updateProperties(gateway, { default: flow.businessObject });
    },
    setCondition(flowId, condition) {
      const api = modeler.current;
      if (!api || !editable) return;
      const flow = api.get("elementRegistry").get(flowId);
      if (!flow) return;
      const expression = condition ? api.get("moddle").create("bpmn:FormalExpression", { body: JSON.stringify(condition) }) : undefined;
      api.get("modeling").updateProperties(flow, { conditionExpression: expression });
    },
  }), [ready, editable, error]);
  function zoom(delta: number) {
    const canvas = modeler.current?.get("canvas");
    if (canvas) canvas.zoom(Math.max(.2, Math.min(3, canvas.zoom() + delta)));
  }
  return <div className="workflow-canvas-wrap">
    <ErrorBox error={error} />
    {!ready && !error && <p className="workflow-loading" role="status">Loading BPMN diagram…</p>}
    <div ref={host} className="workflow-canvas" aria-label={editable ? "Editable BPMN workflow diagram" : "BPMN workflow diagram"} />
    <div className="workflow-zoom">
      <button type="button" className="icon-button" disabled={!ready} aria-label="Zoom out" onClick={() => zoom(-.2)}><Minus size={16} /></button>
      <button type="button" className="icon-button" disabled={!ready} aria-label="Fit workflow" onClick={() => modeler.current && fitDiagram(modeler.current, editable)}><Maximize2 size={16} /></button>
      <button type="button" className="icon-button" disabled={!ready} aria-label="Zoom in" onClick={() => zoom(.2)}><Plus size={16} /></button>
    </div>
  </div>;
});
