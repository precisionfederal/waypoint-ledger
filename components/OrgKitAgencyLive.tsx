'use client';

/* The three pieces of /developers#agency-reuse that depend on the browser: the
   host the page was opened on (so a copy served elsewhere prints its own
   address), and the copy button. Everything else in that section is rendered on
   the server, so the route ships only this. */

import { useEffect, useState } from 'react';
import { baseFor, embedAnchor } from './OrgKitText';

const pre: React.CSSProperties = {
  background: 'var(--surface-2)', border: '1px solid var(--line-2)', borderRadius: 'var(--r-md)',
  padding: '1rem 1.1rem', overflowX: 'auto', fontFamily: 'var(--font-m)', fontSize: '.85rem',
  lineHeight: 1.55, color: 'var(--ink-2)', margin: '0 0 1rem', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
};

function useBase() {
  const [base, setBase] = useState(baseFor(null));
  useEffect(() => { setBase(baseFor(window.location.origin)); }, []);
  return base;
}

/** The two commands that re-run the HL7 validator on this host's example Bundle. */
export function Reproduce({ command }: { command: string }) {
  const base = useBase();
  return <pre style={pre} tabIndex={0}><code>{`curl -s ${base}/api/fhir/example > example.json
${command}`}</code></pre>;
}

/** The copy button for the embed line, its status, and the script form when it is offered. */
export function EmbedCopy({ script }: { script: boolean }) {
  const base = useBase();
  const [said, setSaid] = useState('');
  const copySnippet = async () => {
    try { await navigator.clipboard.writeText(embedAnchor(base)); setSaid('Copied.'); }
    catch { setSaid('Could not copy. Select the line and copy it by hand.'); }
  };
  return (
    <>
      <div className="row">
        <button type="button" className="btn ghost sm" onClick={copySnippet}>Copy the line</button>
      </div>
      <p className="micro" aria-live="polite" role="status">{said}</p>
      {script && (
        <p className="micro">The same button as a script, drawn in its own shadow root: <code>{`<script src="${base}/embed.js" async></script>`}</code></p>
      )}
    </>
  );
}

/** The embed line itself, for this host. */
export function EmbedSnippet() {
  const base = useBase();
  return <pre style={pre} tabIndex={0} data-testid="embed-snippet"><code>{embedAnchor(base)}</code></pre>;
}
