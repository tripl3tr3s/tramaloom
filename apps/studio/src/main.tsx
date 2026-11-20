import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { ErrorBoundary, missingFeatures, Unsupported } from "./ui/Fallbacks.tsx";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("#root missing");
const missing = missingFeatures();
createRoot(root).render(
  <StrictMode>
    {missing.length ? (
      <Unsupported missing={missing} />
    ) : (
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    )}
  </StrictMode>,
);
