import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import "./restored/original-ui.css";
// Optional depth & motion layer; remove this line to restore the flat look.
import "./restored/depth.css";

createRoot(document.getElementById("root")!).render(<App />);
