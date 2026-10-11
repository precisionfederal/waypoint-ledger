'use client';
/* The browser counts the few things it does without the server: a ledger
   opened, the appointment sheet printed, a ledger downloaded as FHIR, CSV,
   JSON or a brief. Each is one word sent to POST /api/use?a=<word>, with no
   body, no cookie (credentials: 'omit') and nothing anyone typed. Fire and
   forget: a count that cannot be sent is simply not counted, and nothing on
   the page waits for it. What the server keeps: cf/functions/api/_use.js.

   It listens instead of being called, so no screen had to change to be
   counted: the route is read from the router, the print from the window's
   own beforeprint, and a download from the click on the <a download> that
   every export in this app makes. */
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

export type UseBeaconAction = 'ledger' | 'sheet' | 'fhir' | 'export';

/** Pure. Which count a downloaded file name is, or null for any other file
 *  (the share image, the register's own CSVs). */
export function downloadAction(name: string): UseBeaconAction | null {
  const n = String(name || '').toLowerCase();
  if (!/^waypoint-(ledger|brief)/.test(n)) return null;
  if (/fhir/.test(n) && n.endsWith('.json')) return 'fhir';
  if (/\.(csv|json|txt)$/.test(n)) return 'export';
  return null;
}

/** Pure. The page a path is, without a trailing slash. */
export const pageOf = (path: string | null | undefined) => (String(path || '/').replace(/\/+$/, '') || '/');

export function sendUse(a: UseBeaconAction): void {
  try {
    // No keepalive: none of these actions leaves the page, and a keepalive request never reports
    // finished to the page, so a page that counts one never reaches network idle.
    // The body is read (and dropped): an unread response stays open, so the page never reaches network idle.
    void fetch(`/api/use?a=${a}`, { method: 'POST', credentials: 'omit', cache: 'no-store' }).then((r) => r.text()).catch(() => undefined);
  } catch { /* no network, no count */ }
}

export default function UseBeacon() {
  const path = usePathname();

  useEffect(() => {
    if (pageOf(path) === '/ledger') sendUse('ledger');
  }, [path]);

  useEffect(() => {
    const onPrint = () => { if (pageOf(window.location.pathname) === '/sheet') sendUse('sheet'); };
    const onClick = (e: MouseEvent) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      const a = t.closest('a[download]');
      if (!a) return;
      const k = downloadAction(a.getAttribute('download') || '');
      if (k) sendUse(k);
    };
    window.addEventListener('beforeprint', onPrint);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeprint', onPrint);
      document.removeEventListener('click', onClick, true);
    };
  }, []);

  return null;
}
