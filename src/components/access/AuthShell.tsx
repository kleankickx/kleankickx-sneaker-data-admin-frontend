import type { ReactNode } from "react";
import { Link } from "react-router-dom";

/** The signed-out pages' frame: icon, title, card, and a way back to sign-in. */
export default function AuthShell({ icon, title, subtitle, children, backToSignIn = true }: {
  icon: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
  backToSignIn?: boolean;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-900 text-white">
            <span aria-hidden="true" className="material-symbols-outlined text-[28px]">{icon}</span>
          </div>
          <h1 className="mt-5 text-2xl font-bold tracking-tight text-gray-900">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-7">{children}</div>
        {backToSignIn && (
          <Link to="/login" className="mx-auto mt-6 block w-fit text-xs font-medium text-gray-500 underline underline-offset-2 hover:text-gray-800">
            Back to sign in
          </Link>
        )}
      </div>
    </div>
  );
}
