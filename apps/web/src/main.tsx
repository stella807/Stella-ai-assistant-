import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { EmployeePortal } from "./components/EmployeePortal.tsx";
import { MasterScreen } from "./components/MasterScreen.tsx";
import { LanguageProvider } from "./i18n.tsx";
import "./styles/base.css";
import "./styles/components.css";
import "./styles/carousel.css";

// Three distinct areas of one app, split by path rather than by a query
// param carried on a link: /employee is the employee portal and /master is
// the owner/secretary dashboard, each with its own sign-in and its own
// session cookie (see EmployeePortal.tsx and MasterScreen.tsx); everything
// else is the customer-facing app. Decided here, before any component's own
// hooks exist, rather than as a conditional early return inside one of them
// (which would run afoul of React's rule that hooks execute unconditionally,
// in the same order, every render).
const path = window.location.pathname.replace(/\/$/, "");
const isEmployeeArea = path === "/employee";
const isMasterArea = path === "/master";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {isEmployeeArea ? <EmployeePortal /> : isMasterArea ? <MasterScreen /> : (
      <LanguageProvider>
        <App />
      </LanguageProvider>
    )}
  </StrictMode>,
);
