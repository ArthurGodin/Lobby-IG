import { createRoot } from "react-dom/client";
import { CampusApp } from "./components/CampusApp";
import "./styles.css";
import "./worldBuilder.css";
import "./welcomeScreen.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Root element not found");
}

createRoot(root).render(<CampusApp />);
