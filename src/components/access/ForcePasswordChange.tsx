import PasswordForm from "./PasswordForm";
import { useAuth } from "../../lib/auth-context";

/** Shown instead of the app until a temporary password is replaced. */
export default function ForcePasswordChange() {
  const { user, setUser, logout } = useAuth();

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-900 text-white">
            <span aria-hidden="true" className="material-symbols-outlined text-[28px]">password</span>
          </div>
          <h1 className="mt-5 text-2xl font-bold tracking-tight text-gray-900">Choose your password</h1>
          <p className="mt-1 text-sm text-gray-500">
            {user?.name ? `Welcome, ${user.name}. ` : ""}You signed in with a temporary password. Choose your own to continue.
          </p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-7">
          <PasswordForm currentLabel="Temporary password" submitLabel="Save and continue" onChanged={setUser} />
        </div>
        <button type="button" onClick={() => logout()}
          className="mx-auto mt-6 block text-xs font-medium text-gray-500 underline underline-offset-2 hover:text-gray-800">
          Sign out
        </button>
      </div>
    </div>
  );
}
