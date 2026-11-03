// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  deactivateIntegrationKey,
  issueIntegrationKey,
  listIntegrationKeys,
  type IntegrationKey,
} from "../lib/access-api";
import IntegrationsPage from "./IntegrationsPage";

vi.mock("../lib/access-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/access-api")>()),
  listIntegrationKeys: vi.fn(),
  issueIntegrationKey: vi.fn(),
  deactivateIntegrationKey: vi.fn(),
}));

vi.mock("../lib/auth-context", () => ({
  useAuth: () => ({ user: { is_superuser: true, permissions: [] }, can: () => true }),
}));

function key(fields: Partial<IntegrationKey> = {}): IntegrationKey {
  return {
    id: "k1",
    name: "KleanKickx orders (staging)",
    key_id: "kkx_0a4263d34794",
    is_active: true,
    last_used_at: null,
    created_at: "2026-11-03T09:00:00Z",
    created_by: "admin1",
    pair_count: 12,
    ...fields,
  };
}

describe("IntegrationsPage", () => {
  beforeEach(() => {
    vi.mocked(listIntegrationKeys).mockResolvedValue([key()]);
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("lists keys without any secret", async () => {
    render(<IntegrationsPage />);
    expect(await screen.findByText("KleanKickx orders (staging)")).toBeInTheDocument();
    expect(screen.getByText("kkx_0a4263d34794")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("Never")).toBeInTheDocument();
  });

  it("issues a key and shows its token once", async () => {
    vi.mocked(issueIntegrationKey).mockResolvedValue({
      key: key({ id: "k2", name: "KleanKickx orders (production)", key_id: "kkx_new" }),
      token: "kkx_new.s3cret",
    });
    render(<IntegrationsPage />);
    fireEvent.click(await screen.findByRole("button", { name: /issue key/i }));
    const dialog = screen.getByRole("dialog", { name: "Issue integration key" });
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "KleanKickx orders (production)" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Issue key" }));

    expect(await screen.findByTestId("one-time-secret")).toHaveTextContent("kkx_new.s3cret");
    expect(issueIntegrationKey).toHaveBeenCalledWith("KleanKickx orders (production)");
    expect(screen.getByText(/won't be shown again/i)).toBeInTheDocument();
    await waitFor(() => expect(listIntegrationKeys).toHaveBeenCalledTimes(2));   // list refreshed

    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByTestId("one-time-secret")).not.toBeInTheDocument();
  });

  it("deactivates a key after confirming", async () => {
    vi.mocked(deactivateIntegrationKey).mockResolvedValue(key({ is_active: false }));
    render(<IntegrationsPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Deactivate" }));
    const confirmDialog = await screen.findByRole("alertdialog");
    expect(confirmDialog).toHaveTextContent(/stops sending pairs/i);
    fireEvent.click(within(confirmDialog).getByRole("button", { name: "Deactivate" }));

    await waitFor(() => expect(deactivateIntegrationKey).toHaveBeenCalledWith("k1"));
    expect(await screen.findByText("Deactivated")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Deactivate" })).not.toBeInTheDocument();
  });
});
