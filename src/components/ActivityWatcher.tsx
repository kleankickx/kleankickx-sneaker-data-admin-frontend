import { useEffect } from "react";

import { setWatchedBulkRuns as writeWatched, watchedBulkRuns as readWatched } from "../lib/activity";
import { listBulkRuns, type BulkRun } from "../lib/bulk-runs";
import { toast } from "../lib/toast";

const POLL_MS = 20_000;

function announce(run: BulkRun) {
  const c = run.counts;
  const view = { label: "View", to: `/pipeline-monitor/bulk/${run.id}` };
  if (run.status === "completed") {
    const problems = c.failed + c.needs_attention;
    const summary = `${c.succeeded} succeeded` + (problems ? `, ${problems} need a look` : "") +
      (c.skipped ? `, ${c.skipped} skipped` : "");
    const notify = problems ? toast.warning : toast.success;
    notify(summary, { title: `Bulk run finished: ${run.label}`, action: view, duration: 0 });
  } else if (run.status === "paused") {
    toast.warning(run.pause_reason || "The vision provider stopped accepting requests.", {
      title: `Bulk run paused: ${run.label}`, action: view, duration: 0,
    });
  } else if (run.status === "cancelled") {
    toast.info(`${c.succeeded} succeeded before it stopped.`, { title: `Bulk run cancelled: ${run.label}`, action: view });
  }
}

/**
 * Background activity worth interrupting for, wherever you are in the
 * admin: watched bulk runs finishing or pausing, and losing the connection.
 */
export default function ActivityWatcher() {
  useEffect(() => {
    let stopped = false;

    async function check() {
      const watched = readWatched();
      if (!watched.length || document.visibilityState !== "visible") return;
      let runs: BulkRun[];
      try {
        runs = await listBulkRuns();
      } catch {
        return;                                   // try again next time
      }
      if (stopped) return;
      const byId = new Map(runs.map((r) => [r.id, r]));
      const still: string[] = [];
      for (const id of watched) {
        const run = byId.get(id);
        if (!run) continue;                       // deleted, or too old to list
        if (run.status === "running") still.push(id);
        else announce(run);
      }
      writeWatched(still);
    }

    check();
    const timer = window.setInterval(check, POLL_MS);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let offlineToast: number | null = null;
    function offline() {
      offlineToast = toast.warning("Changes won't save until you're back online.", {
        title: "You're offline", duration: 0,
      });
    }
    function online() {
      if (offlineToast !== null) toast.dismiss(offlineToast);
      offlineToast = null;
      toast.success("You're back online.");
    }
    window.addEventListener("offline", offline);
    window.addEventListener("online", online);
    return () => {
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", online);
    };
  }, []);

  return null;
}
