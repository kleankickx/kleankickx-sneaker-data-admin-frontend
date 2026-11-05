// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

import type { DatePreset } from "../../lib/date-ranges";
import { DateFilter, SelectFilter } from "./Filters";

afterEach(cleanup);

function StatusHarness() {
  const [value, setValue] = useState("");
  return (
    <SelectFilter
      label="Status"
      value={value}
      onChange={setValue}
      options={[
        { value: "open", label: "Open" },
        { value: "closed", label: "Closed" },
      ]}
    />
  );
}

function DateHarness() {
  const [state, setState] = useState<{ preset: DatePreset; from: string; to: string }>({
    preset: "",
    from: "",
    to: "",
  });
  return (
    <DateFilter
      label="Created"
      {...state}
      onChange={(preset, from, to) => setState({ preset, from, to })}
    />
  );
}

describe("SelectFilter", () => {
  it("picks a value, shows it on the button, and clears it", () => {
    render(<StatusHarness />);
    fireEvent.click(screen.getByRole("button", { name: /status/i }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Closed" }));

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /status\s*closed/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Clear status filter" }));
    expect(screen.getByRole("button", { name: /status/i })).not.toHaveTextContent("Closed");
  });

  it("closes on Escape", () => {
    render(<StatusHarness />);
    fireEvent.click(screen.getByRole("button", { name: /status/i }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});

describe("DateFilter", () => {
  it("applies a preset in one click", () => {
    render(<DateHarness />);
    fireEvent.click(screen.getByRole("button", { name: /created/i }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "This month" }));
    expect(screen.getByRole("button", { name: /created\s*this month/i })).toBeInTheDocument();
  });

  it("applies a custom range only when Apply is pressed", () => {
    render(<DateHarness />);
    fireEvent.click(screen.getByRole("button", { name: /created/i }));
    const apply = screen.getByRole("button", { name: "Apply" });
    expect(apply).toBeDisabled();

    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-10-01" } });
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-10-31" } });
    fireEvent.click(apply);

    expect(screen.queryByLabelText("From")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /created\s*oct 1/i })).toHaveTextContent(/2026/);
  });
});
