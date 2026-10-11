'use client';
/* ==========================================================================
   THE GAP, DRAWN (VISUAL data, 2026-09-30 night).

   One path, the way a search for a diagnosis goes. The first stretch is solid:
   care a person actually got, which is what federal cost files count. Past the
   line where those files stop, the path goes on dashed, with one hollow marker
   for each of the seven kinds of uncounted care on this page. Typing a number
   into a card fills its marker in: counted here, which is the only place it is
   counted. Every word is HTML beside the drawing; the drawing says nothing the
   page does not.
   ========================================================================== */
import { useReveal } from '@/components/DataVisual';

const W = 1000, H = 140, SPLIT = 380;
const yAt = (x: number) => 72 + 24 * Math.sin((x / W) * Math.PI * 2 * 1.1 + 0.5);
const pathFrom = (a: number, b: number) => {
  const pts: string[] = [];
  for (let x = a; x <= b; x += 10) pts.push(`${x === a ? 'M' : 'L'}${x} ${yAt(x).toFixed(1)}`);
  return pts.join(' ');
};
const SOLID = pathFrom(0, SPLIT);
const DASHED = pathFrom(SPLIT, W);
const GOT_X = [70, 175, 280];
const MISSED_X = [450, 532, 613, 695, 777, 858, 940];

/* critic-10: on a phone the same path is drawn in three rows. The solid row runs
   left to right; past the line where the cost files stop the path turns down and
   runs back right to left with markers 1 to 3, then turns again for 4 to 7. */
const SW = 360, SH = 240;
const ySm = (x: number) => 40 + 9 * Math.sin((x / SW) * Math.PI * 2 * 1.2 + 0.4);
const SM_SOLID = (() => { const p: string[] = []; for (let x = 14; x <= 346; x += 8) p.push(`${x === 14 ? 'M' : 'L'}${x} ${ySm(x).toFixed(1)}`); return p.join(' '); })();
const SM_DASHED = `M346 ${ySm(346).toFixed(1)} C 358 72, 352 132, 300 136 L 80 136 C 26 138, 26 210, 80 212 L 330 212`;
const SM_GOT = [70, 180, 290];
const SM_MISS: [number, number][] = [[300, 136], [190, 136], [80, 136], [80, 212], [163, 212], [246, 212], [328, 212]];

export default function GapMap({ cats, counts, sent = false }: {
  cats: { id: string; label: string }[];
  counts: Record<string, number>;
  sent?: boolean;
}) {
  const ref = useReveal<HTMLElement>();
  const counted = cats.filter((c) => (counts[c.id] ?? 0) > 0).length;
  return (
    <figure ref={ref} className={`gp-map${sent ? ' is-sent' : ''}`} aria-labelledby="gp-map-cap">
      <div className="gp-map-art gp-map-lg" aria-hidden="true">
        <span className="gp-map-edge" style={{ left: `${SPLIT / 10}%` }}><span>Where the cost files stop</span></span>
        <svg className="gp-map-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" focusable="false">
          <path className="gp-map-solid" d={SOLID} vectorEffect="non-scaling-stroke" pathLength={1} />
          <path className="gp-map-dashed" d={DASHED} vectorEffect="non-scaling-stroke" />
        </svg>
        {GOT_X.map((x, i) => (
          <span key={x} className="gp-dot gp-dot-got" style={{ left: `${x / 10}%`, top: `${(yAt(x) / H) * 100}%`, ['--d' as string]: `${180 + i * 90}ms` }} />
        ))}
        {cats.slice(0, MISSED_X.length).map((c, i) => {
          const x = MISSED_X[i];
          const on = (counts[c.id] ?? 0) > 0;
          return (
            <span key={c.id} title={c.label} className={`gp-dot gp-dot-miss${on ? ' on' : ''}`}
              style={{ left: `${x / 10}%`, top: `${(yAt(x) / H) * 100}%`, ['--d' as string]: `${520 + i * 70}ms` }}>
              <span className="gp-dot-n">{i + 1}</span>
            </span>
          );
        })}
      </div>
      <div className="gp-map-art gp-map-sm" aria-hidden="true">
        <span className="gp-map-edge-sm"><span>Where the cost files stop</span></span>
        <svg className="gp-map-svg" viewBox={`0 0 ${SW} ${SH}`} preserveAspectRatio="none" focusable="false">
          <path className="gp-map-solid" d={SM_SOLID} vectorEffect="non-scaling-stroke" pathLength={1} />
          <path className="gp-map-dashed" d={SM_DASHED} vectorEffect="non-scaling-stroke" />
        </svg>
        {SM_GOT.map((x, i) => (
          <span key={x} className="gp-dot gp-dot-got" style={{ left: `${(x / SW) * 100}%`, top: `${(ySm(x) / SH) * 100}%`, ['--d' as string]: `${180 + i * 90}ms` }} />
        ))}
        {cats.slice(0, SM_MISS.length).map((c, i) => {
          const [x, y] = SM_MISS[i];
          const on = (counts[c.id] ?? 0) > 0;
          return (
            <span key={c.id} className={`gp-dot gp-dot-miss${on ? ' on' : ''}`}
              style={{ left: `${(x / SW) * 100}%`, top: `${(y / SH) * 100}%`, ['--d' as string]: `${520 + i * 70}ms` }}>
              <span className="gp-dot-n">{i + 1}</span>
            </span>
          );
        })}
      </div>
      <figcaption id="gp-map-cap" className="gp-map-cap">
        <span className="gp-map-side">
          <span className="gp-key gp-key-got" aria-hidden="true" />
          <b>What federal cost files count</b>
          <span>Care you actually got: MEPS&rsquo;s event files, HCUP, Medicare claims.</span>
        </span>
        <span className="gp-map-side">
          <span className="gp-key gp-key-miss" aria-hidden="true" />
          <b>What they never see</b>
          <span>What you needed and never got, in {cats.length} kinds. No federal cost file counts them.</span>
          <span className="gp-map-live" aria-live="polite">
            {counted > 0
              ? (sent ? `${counted} of the ${cats.length} counted in your report.` : `${counted} of the ${cats.length} counted here so far.`)
              : sent ? '' : 'Put a number in any card below and its marker fills in.'}
          </span>
        </span>
      </figcaption>
    </figure>
  );
}
