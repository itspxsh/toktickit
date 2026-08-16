import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import App from "../../src/App.js";
import * as api from "../../src/api.js";

describe("App", () => {
  // WORKED EXAMPLE — provided for you.
  it("renders the TokTickIT heading", () => {
    render(<App />);
    expect(screen.getByText(/TokTickIT/i)).toBeInTheDocument();
  });

  // Issue 4 — write these yourself. Hint: mock the api module with
  // vi.spyOn(api, "checkSystem").mockResolvedValue(...) / .mockRejectedValue(...)
  // then click the button and assert the Online list / Offline message.
  it("shows Online and the seeded categories on success", async () => {
    const mockCategories = [
      { id: 1, name: "Account and Access" },
      { id: 2, name: "Hardware" },
      { id: 3, name: "Software" },
      { id: 4, name: "Network" },
    ];
    const spy = vi.spyOn(api, "checkSystem").mockResolvedValue({
      online: true,
      categories: mockCategories,
    });

    render(<App />);

    const button = screen.getByRole("button", { name: /Check System/i });
    fireEvent.click(button);

    expect(screen.getByText("⌛ loading")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/System Status:/i)).toHaveTextContent("Online");
    });

    mockCategories.forEach((cat) => {
      expect(screen.getByText(cat.name)).toBeInTheDocument();
    });

    spy.mockRestore();
  });

  it("shows an Offline error message when the API is unavailable", async () => {
    const spy = vi.spyOn(api, "checkSystem").mockRejectedValue(new Error("Unable to connect to TokTickIT API"));

    render(<App />);

    const button = screen.getByRole("button", { name: /Check System/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText(/System Status:/i)).toHaveTextContent("Offline");
    });

    expect(screen.getByText("Unable to connect to TokTickIT API")).toBeInTheDocument();

    spy.mockRestore();
  });
});
