import { useState } from "react";
import { checkSystem, Category } from "./api.js";

// UI states you must handle for Issue 4: idle, loading, success, error.
type UiState = "idle" | "loading" | "success" | "error";

export default function App() {
  const [state, setState] = useState<UiState>("idle");
  const [categories, setCategories] = useState<Category[]>([]);
  const [errorMessage, setErrorMessage] = useState<string>("");

  async function handleCheck() {
    setState("loading");
    setErrorMessage("");
    try {
      const result = await checkSystem();
      setCategories(result.categories);
      setState("success");
    } catch (err: any) {
      setErrorMessage(err.message || "Unable to connect to TokTickIT API");
      setState("error");
    }
  }

  return (
    <div className="container py-5" style={{ maxWidth: 640 }}>
      <h1 className="h3 mb-4">
        TokTickIT <span className="text-success">IT Service Desk</span>
      </h1>

      <button className="btn btn-success mb-3" onClick={handleCheck} disabled={state === "loading"}>
        {state === "loading" ? "Loading…" : "Check System"}
      </button>

      {state === "loading" && (
        <div className="mt-2 text-muted">
          ⌛ loading
        </div>
      )}

      {state === "success" && (
        <div className="mt-2">
          <p className="fw-bold">System Status: <span className="text-success">Online</span></p>
          {categories.length > 0 && (
            <div className="mt-3">
              <p className="fw-bold mb-2">Supported Request Categories:</p>
              <ul className="list-group">
                {categories.map((cat) => (
                  <li key={cat.id} className="list-group-item">
                    {cat.name}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {state === "error" && (
        <div className="mt-2">
          <p className="fw-bold">System Status: <span className="text-danger">Offline</span></p>
          <div className="alert alert-danger py-2">
            {errorMessage}
          </div>
        </div>
      )}
    </div>
  );
}
