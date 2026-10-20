import { useEffect, useState, type ReactNode } from 'react';

/** A small inline confirmation ("Saved", "Avatar updated") that fades in, lingers, then fades out.
 *  Remount via `key` to replay it for a repeated action. */
export function Flash({ visible, children }: { visible: boolean; children: ReactNode }) {
  const [shown, setShown] = useState(visible);
  useEffect(() => {
    if (visible) {
      setShown(true);
      const off = window.setTimeout(() => setShown(false), 2600);
      return () => window.clearTimeout(off);
    }
    setShown(false);
  }, [visible]);
  return <span className={`flash-wrap${shown ? ' on' : ''}`}>{children}</span>;
}
