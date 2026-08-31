// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/tokens.css";
import "./styles/app.css";
import { applyProductTheme } from "./domain/theme";
import { applyProductLanguage } from "./domain/i18n";
import { ENGINE_WORDS } from "./domain/words";
import { PRODUCT, WORDS } from "./profile";
import App from "./App";

// Before the first paint: the theme this product opens in, and the tokens it overrides,
// and the language its words are shown in.
applyProductTheme();
applyProductLanguage(PRODUCT.language ?? "en", WORDS, ENGINE_WORDS);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
