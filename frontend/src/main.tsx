import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import MarketDashboard from "./components/MarketDashboard";
import SearchHandoff from "./components/SearchHandoff";
import { isLocalHttpDemoLocation } from "./data/local-http-demo";
import "./styles/globals.css";

const root = document.getElementById("root");
if (!root) throw new Error("Application root was not found.");

createRoot(root).render(
  <StrictMode>
    {import.meta.env.DEV && isLocalHttpDemoLocation(window.location.href) ? <MarketDashboard /> : <SearchHandoff />}
  </StrictMode>,
);
