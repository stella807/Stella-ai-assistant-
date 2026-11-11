import { StrictMode, Suspense } from "react";
import { lazyWithReload, reloadOnceForNewVersion } from "./app/lazy-import.ts";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { LanguageProvider } from "./i18n.tsx";
import "@fontsource/cormorant-garamond/500.css";
import "@fontsource/cormorant-garamond/600.css";
import "@fontsource/cormorant-garamond/500-italic.css";
import "./styles/base.css";
import "./styles/components.css";
import "./styles/map.css";
import "./styles/carousel.css";
import "./styles/popup-cards.css";
import "./styles/home.css";
import "./styles/wingman.css";
import "./styles/art.css";
import "./styles/luxury.css";
import "./styles/luxe.css";
// Last, so its wide-screen overrides win; it changes nothing below 1024px.
import "./styles/desktop.css";
import "./styles/motion.css";

// Three distinct areas of one app, split by path rather than by a query
// param carried on a link: /employee is the employee portal and /master is
// the owner/secretary dashboard, each with its own sign-in and its own
// session cookie (see EmployeePortal.tsx and MasterScreen.tsx); everything
// else is the customer-facing app. Decided here, before any component's own
// hooks exist, rather than as a conditional early return inside one of them
// (which would run afoul of React's rule that hooks execute unconditionally,
// in the same order, every render).
// The employee portal and the owner dashboard are loaded only at their own
// addresses. A customer's phone should not download two back offices to read
// the home page; it is most of what made the first load heavy.
const EmployeePortal = lazyWithReload(() => import("./components/EmployeePortal.tsx").then((m) => ({ default: m.EmployeePortal })));
const MasterScreen = lazyWithReload(() => import("./components/MasterScreen.tsx").then((m) => ({ default: m.MasterScreen })));

const path = window.location.pathname.replace(/\/$/, "");
const isEmployeeArea = path === "/employee";
const isMasterArea = path === "/master";

// Vite fires this when a code chunk the page asked for no longer exists (a deploy replaced it): fetch the new version.
window.addEventListener("vite:preloadError", (e) => {
  if (reloadOnceForNewVersion(sessionStorage, () => window.location.reload())) e.preventDefault();
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* The owner dashboard is English-only; the assistants' portal and the
        customer app each carry the EN/ES toggle. */}
    {/* Nothing is drawn for the instant a portal's code is arriving; the page is already the app's dark background. */}
    <Suspense fallback={null}>
      {isMasterArea ? <MasterScreen /> : (
        <LanguageProvider>
          {isEmployeeArea ? <EmployeePortal /> : <App />}
        </LanguageProvider>
      )}
    </Suspense>
  </StrictMode>,
);
