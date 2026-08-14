// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/tokens.css";
import "./styles/app.css";
import { applyProductTheme } from "./domain/theme";
import App from "./App";

// Before the first paint: the theme this product opens in, and the tokens it overrides.
applyProductTheme();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
