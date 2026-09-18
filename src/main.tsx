import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { ReducedMotionProvider } from "./components/ReducedMotionProvider.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* D-2: app-wide motion config so JS animations honor prefers-reduced-motion */}
    <ReducedMotionProvider>
      <App />
    </ReducedMotionProvider>
  </StrictMode>
);
