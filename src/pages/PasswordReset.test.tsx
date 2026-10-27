// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { confirmPasswordReset, requestPasswordReset } from "../lib/access-api";
import ForgotPasswordPage from "./ForgotPasswordPage";
import ResetPasswordPage from "./ResetPasswordPage";

vi.mock("../lib/access-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/access-api")>()),
  requestPasswordReset: vi.fn(),
  confirmPasswordReset: vi.fn(),
}));

function apiError(code: string, message: string, fields?: Record<string, string[]>) {
  return { response: { data: { success: false, error: { code, message, fields } } } };
}

/* Where the reset page sent us, and with what. */
function SignIn() {
  const location = useLocation();
  return <p>Sign in {location.search} as {(location.state as { username?: string })?.username}</p>;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("forgot password", () => {
  function renderPage() {
    render(
      <MemoryRouter initialEntries={[{ pathname: "/forgot-password", state: { username: "ama" } }]}>
        <Routes>
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it("emails a link and doesn't say whether the account exists", async () => {
    vi.mocked(requestPasswordReset).mockResolvedValue({ emailEnabled: true });
    renderPage();

    // Carried over from the sign-in form
    expect(screen.getByLabelText("Username or email")).toHaveValue("ama");
    fireEvent.click(screen.getByRole("button", { name: "Email me a reset link" }));

    expect(await screen.findByText("Check your email")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("If ama matches an account");
    expect(requestPasswordReset).toHaveBeenCalledWith("ama");
  });

  it("says to ask an administrator when email isn't set up", async () => {
    vi.mocked(requestPasswordReset).mockResolvedValue({ emailEnabled: false });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Email me a reset link" }));
    expect(await screen.findByText("Ask an administrator")).toBeInTheDocument();
  });
});

describe("reset password", () => {
  function renderPage(search = "?uid=MQ&token=abc-123") {
    render(
      <MemoryRouter initialEntries={[`/reset-password${search}`]}>
        <Routes>
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/forgot-password" element={<p>Forgot page</p>} />
          <Route path="/login" element={<SignIn />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  function fill(password: string, confirm = password) {
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: password } });
    fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: confirm } });
    fireEvent.click(screen.getByRole("button", { name: "Set new password" }));
  }

  it("sets the new password and sends you to sign in", async () => {
    vi.mocked(confirmPasswordReset).mockResolvedValue("ama");
    renderPage();
    fill("brand-New-pass-42");

    expect(await screen.findByText(/Sign in \?reason=password_reset as ama/)).toBeInTheDocument();
    expect(confirmPasswordReset).toHaveBeenCalledWith("MQ", "abc-123", "brand-New-pass-42");
  });

  it("checks the two passwords match first", () => {
    renderPage();
    fill("brand-New-pass-42", "brand-New-pass-43");
    expect(screen.getByText("The passwords don't match.")).toBeInTheDocument();
    expect(confirmPasswordReset).not.toHaveBeenCalled();
  });

  it("shows the server's password rules", async () => {
    vi.mocked(confirmPasswordReset).mockRejectedValue(
      apiError("validation_error", "This password is too common.", { new_password: ["This password is too common."] }),
    );
    renderPage();
    fill("password1234");
    expect(await screen.findByText("This password is too common.")).toBeInTheDocument();
  });

  it("offers a new link when this one is used or expired", async () => {
    vi.mocked(confirmPasswordReset).mockRejectedValue(apiError("reset_link_invalid", "This reset link is invalid."));
    renderPage();
    fill("brand-New-pass-42");
    expect(await screen.findByText("This link doesn't work")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: "Email me a new link" }));
    await waitFor(() => expect(screen.getByText("Forgot page")).toBeInTheDocument());
  });

  it("knows a link without its token is broken", () => {
    renderPage("?uid=MQ");
    expect(screen.getByText("This link doesn't work")).toBeInTheDocument();
  });
});
