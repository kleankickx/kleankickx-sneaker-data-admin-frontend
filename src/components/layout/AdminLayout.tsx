import { useEffect, useRef, useState } from "react";
import {
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
} from "react-router-dom";

import { useAuth } from "../../lib/auth-context";
import UploadPanel from "../bulk/UploadPanel";

type NavigationItem = {
  name: string;
  path: string;
  icon: string;
};

const navigation: NavigationItem[] = [
  { name: "Dashboard", path: "/", icon: "dashboard" },
  { name: "Batches", path: "/batches", icon: "inventory_2" },
  { name: "Sneakers", path: "/sneakers", icon: "steps" },
  {
    name: "Verification",
    path: "/verification",
    icon: "fact_check",
  },
  { name: "Review queue", path: "/review-queue", icon: "rule" },
];

function MaterialIcon({
  name,
  className = "",
}: {
  name: string;
  className?: string;
}) {
  return (
    <span
      className={`material-symbols-outlined ${className}`}
      aria-hidden="true"
    >
      {name}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Shared sidebar content                                                     */
/* -------------------------------------------------------------------------- */

function SidebarContent({
  onNavigate,
}: {
  onNavigate?: () => void;
}) {
  return (
    <>
      {/* Brand */}
      <div className="flex h-16 shrink-0 items-center border-b border-gray-200 px-5">
        <div>
          <h1 className="text-lg font-bold tracking-tight">
            KleanKickx
          </h1>

          <p className="text-xs text-gray-500">
            Sneaker Data Platform
          </p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-5">
        <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
          Workspace
        </p>

        <div className="space-y-1">
          {navigation.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === "/"}
              onClick={onNavigate}
              className={({ isActive }) =>
                [
                  "flex items-center gap-3 rounded-lg px-3 py-2.5",
                  "text-sm font-medium transition-colors",
                  isActive
                    ? "bg-gray-900 text-white"
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900",
                ].join(" ")
              }
            >
              <MaterialIcon
                name={item.icon}
                className="text-[20px]"
              />

              <span>{item.name}</span>
            </NavLink>
          ))}
        </div>
      </nav>

      {/* Sidebar footer */}
      <div className="border-t border-gray-200 p-4">
        <div className="rounded-lg bg-gray-50 p-3">
          <div className="flex gap-3">
            <MaterialIcon
              name="database"
              className="text-[20px] text-gray-400"
            />

            <div>
              <p className="text-xs font-medium text-gray-700">
                Data Collection
              </p>

              <p className="mt-1 text-[11px] leading-4 text-gray-500">
                KleanKickx sneaker intake
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Layout                                                                     */
/* -------------------------------------------------------------------------- */

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const menuRef = useRef<HTMLDivElement | null>(null);
  const mobileNavRef = useRef<HTMLDivElement | null>(null);

  /* Close the user menu on outside click. */
  useEffect(() => {
    if (!menuOpen) return;

    function onDocClick(event: MouseEvent) {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node)
      ) {
        setMenuOpen(false);
      }
    }

    window.addEventListener("mousedown", onDocClick);

    return () => {
      window.removeEventListener("mousedown", onDocClick);
    };
  }, [menuOpen]);

  /* Close the mobile drawer on route change. */
  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  /* Escape closes the mobile drawer. */
  useEffect(() => {
    if (!mobileNavOpen) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMobileNavOpen(false);
      }
    }

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [mobileNavOpen]);

  /* Lock body scroll while the drawer is open. */
  useEffect(() => {
    if (!mobileNavOpen) return;

    const previous =
      document.body.style.overflow;

    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previous;
    };
  }, [mobileNavOpen]);

  async function handleSignOut() {
    if (signingOut) return;

    setSigningOut(true);

    try {
      await logout();
    } finally {
      setSigningOut(false);
      setMenuOpen(false);
      navigate("/login", { replace: true });
    }
  }

  const displayName =
    user?.name?.trim() ||
    (user as any)?.username?.trim() ||
    user?.email?.split("@")[0] ||
    "Admin";

  const initials = (() => {
    const source =
      user?.name?.trim() ||
      (user as any)?.username ||
      user?.email ||
      "A";

    const parts = String(source)
      .split(/[\s@._-]+/)
      .filter(Boolean);

    return (
      (parts[0]?.[0] ?? "A").toUpperCase() +
      (parts[1]?.[0] ?? "").toUpperCase()
    );
  })();

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 text-gray-900">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 overflow-y-auto border-r border-gray-200 bg-white lg:flex lg:flex-col">
        <SidebarContent />
      </aside>

      {/* Mobile drawer */}
      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          role="dialog"
          aria-modal="true"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileNavOpen(false)}
          />

          {/* Panel */}
          <div
            ref={mobileNavRef}
            className="absolute inset-y-0 left-0 flex w-64 max-w-[80vw] flex-col overflow-y-auto bg-white shadow-2xl"
          >
            <SidebarContent
              onNavigate={() => setMobileNavOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Main area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="flex h-16 shrink-0 items-center border-b border-gray-200 bg-white px-4 lg:px-6">
          {/* Mobile menu */}
          <button
            type="button"
            onClick={() =>
              setMobileNavOpen((current) => !current)
            }
            className="mr-3 flex h-9 w-9 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 lg:hidden"
            aria-label={
              mobileNavOpen
                ? "Close navigation"
                : "Open navigation"
            }
            aria-expanded={mobileNavOpen}
          >
            <MaterialIcon
              name={mobileNavOpen ? "close" : "menu"}
            />
          </button>

          {/* Page title */}
          <div className="flex-1">
            <h2 className="text-sm font-semibold text-gray-900">
              Sneaker Data Admin
            </h2>

            <p className="hidden text-xs text-gray-500 sm:block">
              Manage and verify collected sneaker data
            </p>
          </div>

          {/* User menu */}
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() =>
                setMenuOpen((current) => !current)
              }
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition hover:bg-gray-50"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-900 text-[12px] font-semibold text-white">
                {initials || (
                  <MaterialIcon
                    className="text-[18px]"
                    name="person"
                  />
                )}
              </div>

              <div className="hidden text-left sm:block">
                <p className="text-xs font-medium text-gray-900">
                  {displayName}
                </p>

                <p className="text-[11px] text-gray-500">
                  {user?.role || "Administrator"}
                </p>
              </div>

              <MaterialIcon
                name="keyboard_arrow_down"
                className="text-[18px] text-gray-400"
              />
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-12 z-30 w-64 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-xl">
                <div className="border-b border-gray-100 px-4 py-3">
                  <p className="text-xs font-semibold text-gray-900">
                    {displayName}
                  </p>

                  <p className="mt-0.5 truncate text-[11px] text-gray-500">
                    {user?.email || (user as any)?.username || ""}
                  </p>
                </div>

                <button
                  type="button"
                  disabled={signingOut}
                  onClick={handleSignOut}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  <MaterialIcon
                    name={
                      signingOut
                        ? "progress_activity"
                        : "logout"
                    }
                    className={`text-[19px] ${
                      signingOut ? "animate-spin" : ""
                    }`}
                  />

                  {signingOut ? "Signing out…" : "Sign out"}
                </button>
              </div>
            )}
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>

      {/* Bulk upload progress; renders nothing while idle. */}
      <UploadPanel />
    </div>
  );
}