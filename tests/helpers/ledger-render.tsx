/* Renders the ledger (or the sheet) to static markup against a store built in
   the test, so the paid-amount invariant can be checked without a browser. */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StoreContext, type Store } from '../../lib/store';
import { TABLE } from '../../lib/table';
import { NCS_COUNT_REASON } from '../../lib/mapper';
import type { JourneyEntry } from '../../lib/types';

const pick = (id: string) => { const t = TABLE.find((x) => x.id === id); if (!t) throw new Error(id); return t; };

/** The demo sentence's six lines, as the live ledger holds them after "Add these 6". */
export function demoEntries(): JourneyEntry[] {
  return [
    { key: 'k1', raw: 'saw my regular doctor three times', item: pick('cms-99213'), times: 3, gapCategory: null, months: null, source: 'rules', modelWhy: null },
    { key: 'k2', raw: 'then a cardiologist', item: pick('cms-99204'), times: 1, gapCategory: null, months: null, source: 'rules', modelWhy: null },
    { key: 'k3', raw: 'the heart ultrasound thing', item: pick('cms-img-echo'), times: 1, gapCategory: null, months: null, source: 'rules', modelWhy: null },
    { key: 'k4', raw: 'then they put electrodes on my legs', item: pick('cms-test-emg'), times: 1, gapCategory: null, months: null, source: 'model', modelWhy: 'electrodes in the muscles of a limb' },
    { key: 'k5', raw: 'and shocked the nerves', item: null, times: 1, gapCategory: null, months: null, reason: NCS_COUNT_REASON } as JourneyEntry,
    { key: 'k6', raw: 'then the ER once when my heart was racing', item: pick('cms-ed-99284-complete'), times: 1, gapCategory: null, months: null, source: 'rules', modelWhy: null },
  ];
}

export function fakeStore(entries: JourneyEntry[], over: Partial<Store> = {}): Store {
  const noop = () => {};
  return {
    entries, ctx: {}, setCoverage: noop, setLocality: noop, unpricedHits: [], gapHints: [], flags: {},
    sentOk: {}, tallies: {}, queued: {}, hydrated: true, toasts: [], toast: noop,
    addStory: () => ({ added: 0, matched: 0, unpriced: 0 }), addSegments: () => ({ added: 0, matched: 0, unpriced: 0 }),
    addOne: noop, addItem: noop, setTimes: noop, remove: noop, remap: noop, reset: noop, loadExample: noop,
    correct: async () => true, clearFlag: noop, shareUrl: () => 'https://waypointledger.org/ledger#j=x',
    saveJourney: async () => ({ ok: false }), saving: false, pendingLink: null, openPendingLink: noop, keepLocalLedger: noop,
    ...over,
  } as Store;
}

export function renderWith(component: React.ComponentType, store: Store): string {
  return renderToStaticMarkup(createElement(StoreContext.Provider, { value: store }, createElement(component)));
}
