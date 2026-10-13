// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useConfirm } from "./useConfirm";

function Harness({ onOuterEscape }: { onOuterEscape: () => void }) {
  const { confirm, dialog } = useConfirm();
  const [answer, setAnswer] = useState("");
  return (
    <div onKeyDown={(e) => e.key === "Escape" && onOuterEscape()}>
      <button type="button" onClick={async () => setAnswer(String(await confirm({
        title: "Delete it?", message: "Gone for good.", confirmLabel: "Delete", tone: "danger",
      })))}>
        Ask
      </button>
      <p>answer: {answer}</p>
      {dialog}
    </div>
  );
}

afterEach(cleanup);

describe("useConfirm", () => {
  it("resolves true or false and is keyboard friendly", async () => {
    const outer = vi.fn();
    render(<Harness onOuterEscape={outer} />);

    const ask = screen.getByRole("button", { name: "Ask" });
    ask.focus();                                                    // a real click focuses the button
    fireEvent.click(ask);
    const dialog = await screen.findByRole("alertdialog", { name: "Delete it?" });
    expect(dialog).toHaveAccessibleDescription("Gone for good.");
    const cancel = screen.getByRole("button", { name: "Cancel" });
    expect(cancel).toHaveFocus();                                   // the safe choice

    fireEvent.keyDown(cancel, { key: "Tab" });                      // focus stays inside
    expect(screen.getByRole("button", { name: "Delete" })).toHaveFocus();

    fireEvent.keyDown(cancel, { key: "Escape" });
    expect(await screen.findByText("answer: false")).toBeInTheDocument();
    expect(outer).not.toHaveBeenCalled();                           // didn't close what's behind
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Ask" })).toHaveFocus();   // focus returns

    fireEvent.click(screen.getByRole("button", { name: "Ask" }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    expect(await screen.findByText("answer: true")).toBeInTheDocument();
  });
});
