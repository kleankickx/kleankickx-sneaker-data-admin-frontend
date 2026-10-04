import { useEffect, useState } from "react";

import { getDashboardStats } from "../lib/api";

type DashboardStatsView = {
  batches: number;
  sneakers: number;
  photos: number;
  pendingVerification: number;
};

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

function StatCardSkeleton() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="h-4 w-28 animate-pulse rounded bg-gray-200" />

          <div className="mt-4 h-9 w-20 animate-pulse rounded-lg bg-gray-200" />
        </div>

        <div className="h-10 w-10 animate-pulse rounded-lg bg-gray-200" />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStatsView>({
    batches: 0,
    sneakers: 0,
    photos: 0,
    pendingVerification: 0,
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      try {
        setLoading(true);
        setError(null);

        const data = await getDashboardStats();

        if (cancelled) return;

        setStats({
          batches: data.batches,
          sneakers: data.sneakers,
          photos: data.photos,
          pendingVerification: data.pending_verification,
        });
      } catch (err) {
        if (cancelled) return;

        console.error("Failed to load dashboard:", err);
        setError("Unable to load dashboard data.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadDashboard();

    return () => {
      cancelled = true;
    };
  }, []);

  const cards = [
    {
      label: "Total batches",
      value: stats.batches,
      icon: "inventory_2",
    },
    {
      label: "Sneaker pairs",
      value: stats.sneakers,
      icon: "footprint",
    },
    {
      label: "Photos uploaded",
      value: stats.photos,
      icon: "photo_library",
    },
    {
      label: "Pending verification",
      value: stats.pendingVerification,
      icon: "fact_check",
    },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">
          Dashboard
        </h1>

        <p className="mt-1 text-sm text-gray-500">
          Overview of the KleanKickx sneaker data collection.
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
          <MaterialIcon
            name="error"
            className="text-[20px] text-red-600"
          />

          <div>
            <p className="text-sm font-medium text-red-800">
              Dashboard data could not be loaded
            </p>

            <p className="mt-1 text-xs text-red-600">
              {error}
            </p>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {loading
          ? Array.from({ length: 4 }).map((_, index) => (
              <StatCardSkeleton key={index} />
            ))
          : cards.map((card) => (
              <div
                key={card.label}
                className="rounded-xl border border-gray-200 bg-white p-5"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-500">
                      {card.label}
                    </p>

                    <p className="mt-3 text-3xl font-bold tracking-tight text-gray-900">
                      {card.value.toLocaleString()}
                    </p>
                  </div>

                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100">
                    <MaterialIcon
                      name={card.icon}
                      className="text-[21px] text-gray-600"
                    />
                  </div>
                </div>
              </div>
            ))}
      </div>

      {/* Recent activity */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              Recent activity
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              Recent data collection activity will appear here.
            </p>
          </div>

          <MaterialIcon
            name="history"
            className="text-[22px] text-gray-400"
          />
        </div>

        <div className="rounded-xl border border-gray-200 bg-white">
          <div className="flex min-h-48 flex-col items-center justify-center px-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
              <MaterialIcon
                name="history"
                className="text-[24px] text-gray-400"
              />
            </div>

            <p className="mt-4 text-sm font-medium text-gray-700">
              No recent activity
            </p>

            <p className="mt-1 max-w-sm text-xs leading-5 text-gray-500">
              Collection and verification activity will appear here
              as data is processed.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}