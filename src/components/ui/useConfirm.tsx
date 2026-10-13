import { useCallback, useState } from "react";

import ConfirmDialog, { type ConfirmOptions } from "./ConfirmDialog";

/**
 * An in-app confirmation instead of window.confirm():
 *
 *   const { confirm, dialog } = useConfirm();
 *   if (!(await confirm({ title: "Delete this role?", tone: "danger" }))) return;
 *   ...
 *   return <>{...}{dialog}</>;
 */
export function useConfirm() {
  const [request, setRequest] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null);

  const confirm = useCallback(
    (options: ConfirmOptions) => new Promise<boolean>((resolve) => setRequest({ ...options, resolve })),
    [],
  );

  const close = useCallback((ok: boolean) => {
    setRequest((current) => {
      current?.resolve(ok);
      return null;
    });
  }, []);

  const dialog = request ? <ConfirmDialog {...request} onConfirm={() => close(true)} onCancel={() => close(false)} /> : null;
  return { confirm, dialog };
}
