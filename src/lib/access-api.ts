/**
 * Users, roles, permissions, the audit log, and the signed-in user's
 * own security (password, two-factor, sessions).
 */
import { api, type AuthUser } from "./api";

/* ============================================================
   PERMISSIONS
   ============================================================ */

export type Permission =
  | "view_batches"
  | "create_batches"
  | "manage_batches"
  | "capture_pairs"
  | "edit_pairs"
  | "export_batches"
  | "identify_pairs"
  | "verify_pairs"
  | "view_pipeline"
  | "run_pipeline"
  | "promote_pipeline_runs"
  | "manage_users"
  | "manage_roles"
  | "view_audit_log";

export interface PermissionInfo {
  codename: Permission;
  label: string;
  description: string;
}

export interface PermissionArea {
  area: string;
  permissions: PermissionInfo[];
}

export async function getPermissionCatalog(): Promise<PermissionArea[]> {
  const response = await api.get("/permissions/");
  return response.data.data;
}

/* ============================================================
   SIGN-IN STEPS AND ACCOUNT SECURITY
   ============================================================ */

/** What POST /auth/login/ asks for next. */
export type LoginStep =
  | { kind: "done"; user: AuthUser }
  | { kind: "mfa"; mfaToken: string }
  | { kind: "mfa_setup"; mfaToken: string };

export async function startLogin(username: string, password: string): Promise<LoginStep> {
  const response = await api.post("/auth/login/", { username, password });
  const data = response.data?.data ?? {};
  if (data.mfa_required) return { kind: "mfa", mfaToken: data.mfa_token };
  if (data.mfa_setup_required) return { kind: "mfa_setup", mfaToken: data.mfa_token };
  return { kind: "done", user: data.user };
}

export async function verifyLoginCode(
  mfaToken: string,
  code: string,
): Promise<{ user: AuthUser; recovery_codes_left?: number }> {
  const response = await api.post("/auth/login/mfa/", { mfa_token: mfaToken, code });
  return response.data.data;
}

export interface MfaSetup {
  secret: string;
  otpauth_uri: string;
  qr_svg: string;
}

/** Start adding an authenticator app (signed in, or with a sign-in mfaToken). */
export async function startMfaSetup(mfaToken?: string): Promise<MfaSetup> {
  const response = await api.post("/auth/mfa/setup/", mfaToken ? { mfa_token: mfaToken } : {});
  return response.data.data;
}

export async function confirmMfaSetup(
  code: string,
  mfaToken?: string,
): Promise<{ recovery_codes: string[]; user: AuthUser }> {
  const response = await api.post("/auth/mfa/confirm/", { code, ...(mfaToken ? { mfa_token: mfaToken } : {}) });
  return response.data.data;
}

export async function disableMfa(password: string, code: string): Promise<AuthUser> {
  const response = await api.post("/auth/mfa/disable/", { password, code });
  return response.data.data.user;
}

export async function regenerateRecoveryCodes(code: string): Promise<string[]> {
  const response = await api.post("/auth/mfa/recovery-codes/", { code });
  return response.data.data.recovery_codes;
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<AuthUser> {
  const response = await api.post("/auth/password/change/", {
    current_password: currentPassword,
    new_password: newPassword,
  });
  return response.data.data.user;
}

export async function signOutEverywhere(): Promise<void> {
  await api.post("/auth/sessions/revoke/");
}

/* ============================================================
   USERS
   ============================================================ */

export interface RoleRef {
  id: number;
  name: string;
}

export interface ManagedUser {
  id: string;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  name: string;
  is_active: boolean;
  is_superuser: boolean;
  roles: RoleRef[];
  permissions: Permission[];
  last_login: string | null;
  date_joined: string;
  mfa_enabled: boolean;
  must_change_password: boolean;
  locked_minutes: number;
  password_changed_at: string | null;
}

export interface Page<T> {
  results: T[];
  count: number;
}

export interface UserFilters {
  search?: string;
  role?: string;
  status?: "" | "active" | "inactive" | "locked";
  mfa?: "" | "on" | "off";
  page?: number;
  page_size?: number;
}

function clean<T extends object>(params: T) {
  return Object.fromEntries(Object.entries(params).filter(([, v]) => v !== "" && v !== undefined && v !== null));
}

export async function listUsers(filters: UserFilters = {}): Promise<Page<ManagedUser>> {
  const response = await api.get("/users/", { params: clean(filters) });
  return { results: response.data.data, count: response.data.meta?.count ?? response.data.data.length };
}

export async function getUser(id: string): Promise<ManagedUser> {
  const response = await api.get(`/users/${id}/`);
  return response.data.data;
}

export interface UserInput {
  username?: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  role_ids?: number[];
}

export async function createUser(input: UserInput): Promise<{ user: ManagedUser; temporary_password: string }> {
  const response = await api.post("/users/", input);
  return response.data.data;
}

export async function updateUser(id: string, input: UserInput): Promise<ManagedUser> {
  const response = await api.patch(`/users/${id}/`, input);
  return response.data.data;
}

export type UserAction = "deactivate" | "activate" | "revoke-sessions" | "unlock" | "reset-mfa";

export async function runUserAction(id: string, action: UserAction): Promise<ManagedUser> {
  const response = await api.post(`/users/${id}/${action}/`);
  return response.data.data;
}

export async function resetUserPassword(id: string): Promise<{ user: ManagedUser; temporary_password: string }> {
  const response = await api.post(`/users/${id}/reset-password/`);
  return response.data.data;
}

/* ============================================================
   ROLES
   ============================================================ */

export interface Role {
  id: number;
  name: string;
  description: string;
  is_system: boolean;
  is_administrator: boolean;
  require_mfa: boolean;
  permissions: Permission[];
  user_count: number;
  updated_at: string | null;
  members?: { id: string; username: string; name: string; is_active: boolean }[];
}

export interface RoleInput {
  name?: string;
  description?: string;
  permissions?: Permission[];
  require_mfa?: boolean;
}

export async function listRoles(): Promise<Role[]> {
  const response = await api.get("/roles/");
  return response.data.data;
}

export async function getRole(id: number): Promise<Role> {
  const response = await api.get(`/roles/${id}/`);
  return response.data.data;
}

export async function createRole(input: RoleInput): Promise<Role> {
  const response = await api.post("/roles/", input);
  return response.data.data;
}

export async function updateRole(id: number, input: RoleInput): Promise<Role> {
  const response = await api.patch(`/roles/${id}/`, input);
  return response.data.data;
}

export async function deleteRole(id: number): Promise<void> {
  await api.delete(`/roles/${id}/`);
}

/* ============================================================
   AUDIT LOG
   ============================================================ */

export interface AuditEvent {
  id: string;
  created_at: string;
  action: string;
  action_label: string;
  actor: { id: string; username: string } | null;
  actor_label: string;
  target_type: "" | "user" | "role";
  target_id: string;
  target_label: string;
  details: Record<string, unknown>;
  ip_address: string | null;
  user_agent: string;
}

export interface AuditFilters {
  action?: string;
  target?: string;
  target_type?: string;
  search?: string;
  from?: string;
  to?: string;
  page?: number;
  page_size?: number;
}

export async function listAuditEvents(filters: AuditFilters = {}): Promise<Page<AuditEvent>> {
  const response = await api.get("/audit-events/", { params: clean(filters) });
  return { results: response.data.data, count: response.data.meta?.count ?? response.data.data.length };
}

export async function getAuditActions(): Promise<{ value: string; label: string }[]> {
  const response = await api.get("/audit-events/actions/");
  return response.data.data;
}
