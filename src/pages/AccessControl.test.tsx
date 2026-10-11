// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AdminLayout from "../components/layout/AdminLayout";
import RequirePermission from "../components/access/RequirePermission";
import {
  createUser,
  getPermissionCatalog,
  getRole,
  listRoles,
  listUsers,
  updateRole,
  verifyLoginCode,
  type ManagedUser,
  type Role,
} from "../lib/access-api";
import type { AuthUser } from "../lib/api";
import ProtectedRoute from "../lib/protected-route";
import LoginPage from "./LoginPage";
import RolesPage from "./RolesPage";
import UsersPage from "./UsersPage";

vi.mock("../lib/access-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/access-api")>()),
  verifyLoginCode: vi.fn(),
  listUsers: vi.fn(),
  listRoles: vi.fn(),
  getRole: vi.fn(),
  createUser: vi.fn(),
  updateRole: vi.fn(),
  getPermissionCatalog: vi.fn(),
  listAuditEvents: vi.fn().mockResolvedValue({ results: [], count: 0 }),
}));

vi.mock("../components/bulk/UploadPanel", () => ({ default: () => null }));

/* The signed-in user each test sets. */
const auth = {
  user: null as AuthUser | null,
  login: vi.fn(),
  completeLogin: vi.fn(),
  setUser: vi.fn(),
  logout: vi.fn(),
};

vi.mock("../lib/auth-context", () => ({
  useAuth: () => ({
    ...auth,
    initializing: false,
    sessionExpired: false,
    can: (p: string) => Boolean(auth.user?.is_superuser || auth.user?.permissions?.includes(p)),
  }),
}));

const ALL = [
  "view_batches", "create_batches", "manage_batches", "capture_pairs", "edit_pairs", "export_batches",
  "identify_pairs", "verify_pairs", "view_pipeline", "run_pipeline", "promote_pipeline_runs",
  "manage_users", "manage_roles", "view_audit_log",
];

function signIn(permissions: string[], extra: Partial<AuthUser> = {}) {
  auth.user = { id: "u1", email: "me@example.com", username: "me", name: "Me", roles: [], permissions, ...extra };
}

const ROLES: Role[] = [
  { id: 1, name: "Administrator", description: "Everything", is_system: true, is_administrator: true,
    require_mfa: false, permissions: ALL as Role["permissions"], user_count: 1, updated_at: null },
  { id: 2, name: "Viewer", description: "Read-only", is_system: true, is_administrator: false,
    require_mfa: false, permissions: ["view_batches", "view_pipeline"], user_count: 3, updated_at: null },
  { id: 9, name: "Auditor", description: "", is_system: false, is_administrator: false,
    require_mfa: false, permissions: ["view_batches"], user_count: 0, updated_at: null },
];

const USER: ManagedUser = {
  id: "u2", username: "kojo", email: "kojo@example.com", first_name: "Kojo", last_name: "", name: "Kojo",
  is_active: true, is_superuser: false, roles: [{ id: 2, name: "Viewer" }], permissions: ["view_batches"],
  last_login: null, date_joined: "2026-10-01T10:00:00Z", mfa_enabled: false, must_change_password: false,
  locked_minutes: 0, password_changed_at: null,
};

beforeEach(() => {
  vi.mocked(listRoles).mockResolvedValue(ROLES);
  vi.mocked(listUsers).mockResolvedValue({ results: [USER], count: 1 });
  vi.mocked(getPermissionCatalog).mockResolvedValue([
    { area: "Batches & pairs", permissions: [
      { codename: "view_batches", label: "View batches and pairs", description: "See batches." },
      { codename: "export_batches", label: "Export batch data", description: "Download." },
    ] },
    { area: "Administration", permissions: [
      { codename: "view_audit_log", label: "View the audit log", description: "Sign-ins." },
    ] },
  ]);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  auth.user = null;
});

describe("sign-in", () => {
  it("asks for the authenticator code after the password", async () => {
    auth.login.mockResolvedValue({ kind: "mfa", mfaToken: "pending" });
    vi.mocked(verifyLoginCode).mockResolvedValue({ user: { id: "u1", email: "me@example.com" } });
    render(
      <MemoryRouter initialEntries={["/login"]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<p>Home</p>} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "me" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "Secret-Pass-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Two-factor sign-in")).toBeInTheDocument();
    const code = screen.getByLabelText("Code from your authenticator app");
    fireEvent.change(code, { target: { value: "12a3 456" } });
    expect(code).toHaveValue("123456");                       // digits only
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));

    await waitFor(() => expect(verifyLoginCode).toHaveBeenCalledWith("pending", "123456"));
    expect(auth.completeLogin).toHaveBeenCalled();
    expect(await screen.findByText("Home")).toBeInTheDocument();
  });

  it("makes a user on a temporary password choose a new one first", () => {
    signIn(["view_batches"], { must_change_password: true });
    render(
      <MemoryRouter>
        <ProtectedRoute><p>Dashboard</p></ProtectedRoute>
      </MemoryRouter>,
    );
    expect(screen.getByText("Choose your password")).toBeInTheDocument();
    expect(screen.queryByText("Dashboard")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Temporary password")).toBeInTheDocument();
  });
});

describe("what people see", () => {
  function renderLayout() {
    render(
      <MemoryRouter>
        <Routes><Route path="/" element={<AdminLayout />} /></Routes>
      </MemoryRouter>,
    );
    /* Accessible names leave out the (aria-hidden) icons. */
    return (name: string) => screen.queryAllByRole("link", { name }).length > 0;
  }

  it("shows a viewer only what they can use", () => {
    signIn(["view_batches", "view_pipeline"]);
    const has = renderLayout();
    expect(["Dashboard", "Batches", "Pipeline monitor"].every(has)).toBe(true);
    expect(has("Verification")).toBe(false);
    expect(screen.queryByText("Settings")).not.toBeInTheDocument();
  });

  it("gives administrators the settings pages", () => {
    signIn([], { is_superuser: true });
    const has = renderLayout();
    expect(["Users", "Roles", "Audit log", "Verification"].every(has)).toBe(true);
  });

  it("explains a page someone can't open", () => {
    signIn(["view_batches"]);
    render(
      <MemoryRouter>
        <RequirePermission permissions={["manage_users"]}><p>Users</p></RequirePermission>
      </MemoryRouter>,
    );
    expect(screen.getByText("You don't have access to this page")).toBeInTheDocument();
    expect(screen.queryByText("Users")).not.toBeInTheDocument();
  });
});

describe("users", () => {
  it("adds a user and shows the temporary password once", async () => {
    signIn(["manage_users", "view_batches", "view_pipeline"]);
    vi.mocked(createUser).mockResolvedValue({ user: { ...USER, id: "u3", username: "ama" }, temporary_password: "kQ7v-2Lxp-9TfA-mW3c" });
    render(<MemoryRouter><UsersPage /></MemoryRouter>);

    expect(await screen.findByText("Kojo")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Add user/ }));
    const dialog = screen.getByRole("dialog", { name: "Add user" });
    fireEvent.change(within(dialog).getByLabelText("Username"), { target: { value: "ama" } });

    // Roles with permissions you don't hold can't be granted
    const admin = within(dialog).getByRole("checkbox", { name: /Administrator/ });
    expect(admin).toBeDisabled();
    fireEvent.click(within(dialog).getByRole("checkbox", { name: /Viewer/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Create user" }));

    await waitFor(() => expect(createUser).toHaveBeenCalledWith(expect.objectContaining({ username: "ama", role_ids: [2] })));
    expect(await screen.findByTestId("one-time-secret")).toHaveTextContent("kQ7v-2Lxp-9TfA-mW3c");
  });
});

describe("roles", () => {
  it("locks the Administrator role and saves a custom role's permissions", async () => {
    signIn(ALL);
    vi.mocked(getRole).mockImplementation(async (id) => ({ ...ROLES.find((r) => r.id === id)!, members: [] }));
    vi.mocked(updateRole).mockResolvedValue({ ...ROLES[2], permissions: ["view_batches", "view_audit_log"], members: [] });
    render(<MemoryRouter><RolesPage /></MemoryRouter>);

    expect(await screen.findByText("The Administrator role always has every permission.")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Export batch data/ })).toBeDisabled();
    expect(screen.getByLabelText("Name")).toBeDisabled();                // system role

    fireEvent.click(screen.getByRole("button", { name: /Auditor/ }));
    const audit = await screen.findByRole("checkbox", { name: /View the audit log/ });
    await waitFor(() => expect(audit).toBeEnabled());
    fireEvent.click(audit);
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(updateRole).toHaveBeenCalledWith(9, { permissions: ["view_batches", "view_audit_log"] }),
    );
  });
});
