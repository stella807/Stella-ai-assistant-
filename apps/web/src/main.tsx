import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { EmployeePortal } from "./components/EmployeePortal.tsx";
import "./styles/base.css";
import "./styles/components.css";

// Two distinct areas of one app, split by path rather than by a query param
// carried on a link: /employee is the employee portal, with its own sign-in
// and its own session cookie (see EmployeePortal.tsx); everything else is
// the customer-facing app. Decided here, before either component's own hooks
// exist, rather than as a conditional early return inside one of them (which
// would run afoul of React's rule that hooks execute unconditionally, in the
// same order, every render).
const isEmployeeArea = window.location.pathname.replace(/\/$/, "") === "/employee";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {isEmployeeArea ? <EmployeePortal /> : <App />}
  </StrictMode>,
);
