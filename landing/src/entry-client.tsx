import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { Landing } from "./Landing";
import "./styles.css";

const root = document.getElementById("root")!;
const app = (
  <StrictMode>
    <Landing />
  </StrictMode>
);

// Production pages arrive pre-rendered; hydrate them. The dev server renders on the client.
if (root.hasChildNodes()) hydrateRoot(root, app);
else createRoot(root).render(app);
