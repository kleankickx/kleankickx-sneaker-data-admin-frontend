import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { getDashboardActivity, type ActivityItem, type ActivityType } from "../../lib/api";

const ICONS: Record<ActivityType, { icon: string; tone: string }> = {
  batch_created: { icon: "inventory_2", tone: "bg-gray-100 text-gray-600" },
  order_pairs: { icon: "shopping_bag", tone: "bg-sky-50 text-sky-700" },
  pairs_added: { icon: "add_box", tone: "bg-gray-100 text-gray-600" },
  photos_uploaded: { icon: "photo_camera", tone: "bg-violet-50 text-violet-700" },
  identified: { icon: "search", tone: "bg-amber-50 text-amber-700" },
  verified: { icon: "verified", tone: "bg-emerald-50 text-emerald-700" },
};

/* "just now", "5 min ago", "3 h ago", "2 days ago", then the date. */
function timeAgo(value: string, now = Date.now()) {
  const seconds = Math.max(0, Math.round((now - new Date(value).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function href(link: ActivityItem["link"]) {
  if (!link) return null;
  return link.kind === "batch" ? `/batches/${link.id}` : `/sneakers/${link.id}`;
}

/** The dashboard's "Recent activity" panel. */
export default function RecentActivity() {
  const [items, setItems] = useState<ActivityItem[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let live = true;
    getDashboardActivity(4).then(   // just the latest few: the dashboard is a glance, not a log
      (list) => live && setItems(list),
      () => live && setError(true),
    );
    return () => {
      live = false;
    };
  }, []);

  if (error) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white px-6 py-10 text-center text-sm text-gray-500">
        Recent activity couldn't be loaded.
      </div>
    );
  }

  if (items === null) {
    return (
      <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-5" aria-label="Loading activity">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-10 animate-pulse rounded-lg bg-gray-100" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="flex min-h-48 flex-col items-center justify-center px-6 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
            <span aria-hidden="true" className="material-symbols-outlined text-[24px] text-gray-400">history</span>
          </div>
          <p className="mt-4 text-sm font-medium text-gray-700">No activity yet</p>
          <p className="mt-1 max-w-sm text-xs leading-5 text-gray-500">
            New batches, pairs, photos, identifications and verifications will show here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
      {items.map((item, index) => {
        const { icon, tone } = ICONS[item.type] ?? ICONS.batch_created;
        const to = href(item.link);
        const body = (
          <>
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${tone}`}>
              <span aria-hidden="true" className="material-symbols-outlined text-[19px]">{icon}</span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-gray-900">{item.title}</span>
              {item.detail && <span className="block truncate text-xs text-gray-500">{item.detail}</span>}
            </span>
            <time dateTime={item.at} title={new Date(item.at).toLocaleString("en-GB")}
              className="shrink-0 whitespace-nowrap text-xs text-gray-400">
              {timeAgo(item.at)}
            </time>
          </>
        );
        return (
          <li key={`${item.type}-${item.at}-${index}`}>
            {to ? (
              <Link to={to} className="flex items-center gap-3 px-5 py-3 transition hover:bg-gray-50">{body}</Link>
            ) : (
              <div className="flex items-center gap-3 px-5 py-3">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
