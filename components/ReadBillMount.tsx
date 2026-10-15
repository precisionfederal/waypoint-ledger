'use client';
/* The "Read my bill" card on /journey. This file is the only part that ships
   with the page: a heading, one sentence and a button. The reader itself
   (components/ReadBill.tsx, lib/read-bill.ts, lib/read-pdf.ts) loads when the
   person opens it, or straight away when the link carries #read-bill. */
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { READ_BILL_PROMISE } from '@/lib/read-bill-promise';
import s from './ReadBill.module.css';

const load = () => import('./ReadBill');
const ReadBill = dynamic(load, {
  ssr: false,
  loading: () => <p className={s.note} role="status">Opening the bill reader...</p>,
});

export default function ReadBillMount() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (window.location.hash === '#read-bill') setOpen(true);
  }, []);
  return (
    <section className={`card ${s.card}`} id="read-bill" aria-labelledby="read-bill-h">
      <div className={s.head}>
        <div>
          <h2 id="read-bill-h" className={s.h}>Have a bill or an insurance statement? Read it instead of typing.</h2>
          <p className={s.lede}>
            Paste or drop a bill, an Explanation of Benefits or a Medicare Summary Notice. We pick out the service codes and dates and you choose what goes on your ledger.
            {/* Once open, the panel carries the same sentence as its first line. */}
            {!open && <>{' '}<strong>{READ_BILL_PROMISE}</strong></>}
          </p>
        </div>
        {!open && (
          <button type="button" className="btn primary" aria-controls="read-bill-panel" aria-expanded={false}
            onPointerEnter={() => void load()} onFocus={() => void load()} onClick={() => setOpen(true)}>
            Read my bill
          </button>
        )}
      </div>
      {open && <div id="read-bill-panel"><ReadBill onClose={() => setOpen(false)} /></div>}
    </section>
  );
}
