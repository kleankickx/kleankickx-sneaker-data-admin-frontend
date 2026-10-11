import type { Permission } from "./access-api";

/* Labels for the signed-in user's own permissions (the account page).
   The roles editor reads the authoritative list from GET /permissions/. */
export const PERMISSION_LABELS: Record<Permission, string> = {
  view_batches: "View batches and pairs",
  create_batches: "Create and open batches",
  manage_batches: "Manage batches",
  capture_pairs: "Capture pairs and photos",
  edit_pairs: "Edit and delete pairs",
  export_batches: "Export batch data",
  identify_pairs: "Identify pairs",
  verify_pairs: "Verify pairs",
  view_pipeline: "View the pipeline",
  run_pipeline: "Run the pipeline",
  promote_pipeline_runs: "Use a run's result",
  manage_users: "Manage users",
  manage_roles: "Manage roles",
  view_audit_log: "View the audit log",
};

export function formatWhen(value: string | null | undefined) {
  if (!value) return "Never";
  return new Date(value).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
