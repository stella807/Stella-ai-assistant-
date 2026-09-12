import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { AssistantPortal } from "./components/AssistantPortal.tsx";
import "./styles/base.css";
import "./styles/components.css";

// A concierge assistant has no Safehubby account and never signs in — this
// link is the whole surface they see. Decided here, before App's own hooks
// and its rider-facing sign-in gate exist at all, rather than as a
// conditional early return inside App (which would run afoul of React's
// rule that hooks execute unconditionally, in the same order, every render).
const assistantToken = new URLSearchParams(window.location.search).get("assistant_token");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {assistantToken ? <AssistantPortal token={assistantToken} /> : <App />}
  </StrictMode>,
);
