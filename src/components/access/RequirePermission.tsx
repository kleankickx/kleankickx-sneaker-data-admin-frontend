import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import type { Permission } from "../../lib/access-api";
import { useAuth } from "../../lib/auth-context";

/** Shows the page only to users holding one of `permissions`. */
export default function RequirePermission({
  permissions,
  children,
}: {
  permissions: Permission[];
  children: ReactNode;
}) {
  const { can } = useAuth();
  if (permissions.some(can)) return <>{children}</>;

  return (
    <div className="mx-auto mt-16 max-w-md rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
        <span aria-hidden="true" className="material-symbols-outlined text-gray-500">lock</span>
      </div>
      <h1 className="mt-4 text-base font-semibold text-gray-900">You don't have access to this page</h1>
      <p className="mt-1.5 text-sm text-gray-500">
        Ask an administrator to give you a role that includes it.
      </p>
      <Link to="/account" className="mt-5 inline-flex rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800">
        Go to your account
      </Link>
    </div>
  );
}
