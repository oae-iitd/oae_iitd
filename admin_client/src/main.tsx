import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import "./components/common/edge-states.css";

console.log("main.tsx loaded");

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element not found");
}

console.log("Root element found:", rootElement);

try {
  const root = ReactDOM.createRoot(rootElement);
  console.log("React root created");
  
  root.render(<App />);
  
  console.log("App rendered");
} catch (error) {
  console.error("Error rendering app:", error);
  rootElement.innerHTML = `
    <div style="padding: 2rem; color: red; background: white;">
      <h1>Error Loading App</h1>
      <pre>${error instanceof Error ? error.message : String(error)}</pre>
    </div>
  `;
}
