/* ==========================================================================
   How a line gets its price, drawn. HTML boxes on a grid, joined by inline
   SVG wires that draw themselves once (MethodMotion arms them; reduced motion
   and no script both show them drawn). The boxes are the text equivalent:
   every word of the diagram is real text in reading order.

   The worked example is not typed here. /method passes in a synonym from the
   price table, the row the rules reader (lib/mapper.ts mapUtterance) returns
   for it when the page is built, that row's audit evidence and its source
   file. If the reader ever stops returning a row, the example is left out.
   ========================================================================== */

import type { ReactNode } from 'react';
import { G, Glyph } from './glyphs';

export interface PathExample {
  phrase: string;
  unitId: string;
  unitLabel: string;
  code?: string;
  evidence?: string | null;
  value: string;
  year: string;
  basis: string;
  population: string;
  doesNotDescribe?: string | null;
  sourceTitle: string;
  sourceUrl: string;
  sha?: string | null;
}

/* A wire: a straight stroke with a chevron head. viewBox stretched to the
   box, stroke kept at 1.5 px by non-scaling-stroke. */
function Wire({ dir, d, head = true, cls = '' }: { dir: 'h' | 'v' | 'u'; d: number; head?: boolean; cls?: string }) {
  const v = dir !== 'h';
  return (
    <span className={`mx-wire mx-wire-${dir} ${cls}`} style={{ ['--d' as string]: `${d}ms` }} aria-hidden="true">
      <svg viewBox={v ? '0 0 12 100' : '0 0 100 12'} preserveAspectRatio="none" focusable="false">
        <path d={dir === 'u' ? 'M6 100V0' : v ? 'M6 0V100' : 'M0 6H100'} pathLength={1} vectorEffect="non-scaling-stroke" />
      </svg>
      {head && <i className="mx-wire-head" />}
    </span>
  );
}

function Node({ n, icon, title, children, eg, cls = '', i }:
  { n: number; icon: ReactNode; title: string; children: ReactNode; eg?: ReactNode; cls?: string; i: number }) {
  return (
    <div className={`mx-node ${cls}`} style={{ ['--i' as string]: i }}>
      <span className="mx-node-ic"><Glyph g={icon} /></span>
      <h3 className="mx-node-h"><span className="mx-node-n">{n}</span> {title}</h3>
      <p className="mx-node-p">{children}</p>
      {eg && <div className="mx-eg">{eg}</div>}
    </div>
  );
}

export default function PricePath({ rows, ex }: { rows: number | null; ex: PathExample | null }) {
  return (
    <div className="mx-path" data-motion="">
      <Node n={1} i={0} cls="mx-n1" icon={G.type} title="You type it"
        eg={ex && <><span className="mx-eg-k">For example</span><q className="mx-eg-said">{ex.phrase}</q></>}>
        What happened, in your own words.
      </Node>
      <Wire dir="h" d={250} cls="mx-w1" />

      <Node n={2} i={1} cls="mx-n2" icon={G.rules} title="The rules read it"
        eg={ex && <><span className="mx-eg-k">Placed by a rule</span><code>{ex.unitId}</code></>}>
        Rules in this code map each phrase they recognise to a unit of care.
      </Node>

      <div className="mx-ai" style={{ ['--i' as string]: 2 }}>
        <Wire dir="v" d={650} head={false} cls="mx-port mx-port-a" />
        <Wire dir="u" d={1050} cls="mx-port mx-port-b" />
        <p className="mx-ai-k">Only when the rules cannot place a phrase</p>
        <h3 className="mx-node-h"><Glyph g={G.spark} size={20} /> The AI reader fills a blank</h3>
        <p className="mx-node-p">
          It names a unit of care, or nothing. <strong>Never a price.</strong> It sees the phrase and at most four
          words either side, never the rest of the story.
        </p>
        <p className="mx-ai-models">
          <span className="mx-ai-lbl">On this site</span>
          <span className="mx-chain"><code>gpt-5.6-luna</code><code>gpt-5.5</code><code>gpt-5.4-mini</code></span>
        </p>
        <p className="mx-node-p"><a href="#ai">How the AI reads a story</a></p>
      </div>

      <Wire dir="h" d={550} cls="mx-w2" />
      <Node n={3} i={3} cls="mx-n3" icon={G.unit} title="A unit of care"
        eg={ex && <><span className="mx-eg-k">Unit</span><span>{ex.unitLabel}</span></>}>
        One thing that happened, named the way the price table names it.
      </Node>
      <Wire dir="h" d={850} cls="mx-w3" />

      <Node n={4} i={4} cls="mx-n4" icon={G.table} title="A federal row prices it"
        eg={ex && <><span className="mx-eg-k">{ex.code ?? 'Row'}</span>{ex.evidence ? <span className="mx-eg-mono">{ex.evidence}</span> : <span>{ex.value}</span>}</>}>
        {rows ? `One of ${rows} published figures` : 'A published figure'}, read from a federal file or computed from its figures.
      </Node>

      <div className="mx-unp" style={{ ['--i' as string]: 5 }}>
        <Wire dir="v" d={1150} cls="mx-port mx-port-c" />
        <h3 className="mx-node-h"><Glyph g={G.blank} size={20} /> Not in the table?</h3>
        <p className="mx-node-p">The line comes back unpriced and is shown to you as unpriced, by name.</p>
      </div>

      <Wire dir="h" d={1150} cls="mx-w4" />

      <div className="mx-line" style={{ ['--i' as string]: 6 }}>
        <span className="mx-node-ic is-end"><Glyph g={G.receipt} /></span>
        <h3 className="mx-node-h"><span className="mx-node-n">5</span> Your ledger line</h3>
        <p className="mx-node-p">It names its file. Open it for the row and, on a fee-schedule figure, the file&rsquo;s SHA-256.</p>
        {ex && (
          <div className="mx-receipt">
            <p className="mx-receipt-top">
              <span className="mx-receipt-name">{ex.unitLabel}</span>
              <b className="mx-receipt-fig">{ex.value}</b>
            </p>
            <dl className="mx-receipt-dl">
              <div><dt>Year</dt><dd>{ex.year}</dd></div>
              <div><dt>Basis</dt><dd>{ex.basis}</dd></div>
              <div className="is-wide"><dt>Population</dt><dd>{ex.population}</dd></div>
              {ex.doesNotDescribe && <div className="is-wide"><dt>Coverage</dt><dd>Does not describe {ex.doesNotDescribe}</dd></div>}
              <div className="is-wide"><dt>Source</dt><dd><a href={ex.sourceUrl} target="_blank" rel="noopener noreferrer">{ex.sourceTitle}</a></dd></div>
              {ex.sha && <div className="is-wide"><dt>SHA-256</dt><dd className="mx-receipt-sha">{ex.sha.slice(0, 16)}&hellip;</dd></div>}
            </dl>
          </div>
        )}
      </div>
    </div>
  );
}
