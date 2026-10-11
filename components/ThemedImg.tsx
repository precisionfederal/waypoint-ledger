/* ThemedImg: one illustration, two renditions (ART lane, 2026-09-30 night).
   Renders the light and dark files as two <img> siblings with the same width and height; CSS hides exactly one,
   so the box never changes size when the theme flips (CLS 0). It keys off the same switches as the colour tokens
   in globals.css: :root[data-theme="dark"] (4b's opt-in), or the OS dark preference when the page has not pinned
   data-theme="light". A <picture> media query cannot see the data-theme attribute, hence two tags.
   The dark copy is loading="lazy" while hidden, so browsers that defer hidden lazy images do not fetch it in the
   light theme. Decorative art (alt="") is aria-hidden on both copies.
   Usage: <ThemedImg light="/img/v2/gap-hero.webp" dark="/img/v2/gap-hero-dark.webp" width={1200} height={525} alt="" className="x" /> */
/* The two hide rules are global (.ti-lt / .ti-dk in app/globals.css). */
const s = { lt: 'ti-lt', dk: 'ti-dk' } as const;

export type ThemedImgProps = {
  light: string;
  dark: string;
  width: number;
  height: number;
  alt: string;
  className?: string;
  /* The light copy's loading; a hero above the fold can pass 'eager'. The dark copy is always lazy. */
  loading?: 'eager' | 'lazy';
  fetchPriority?: 'high' | 'low' | 'auto';
  sizes?: string;
};

export default function ThemedImg({ light, dark, width, height, alt, className, loading = 'lazy', fetchPriority, sizes }: ThemedImgProps) {
  const deco = alt === '' ? { 'aria-hidden': true as const } : {};
  const cls = (k: string) => (className ? `${className} ${k}` : k);
  return (
    <>
      <img className={cls(s.lt)} src={light} width={width} height={height} alt={alt} loading={loading} fetchPriority={fetchPriority} sizes={sizes} decoding="async" {...deco} />
      <img className={cls(s.dk)} src={dark} width={width} height={height} alt={alt} loading="lazy" sizes={sizes} decoding="async" {...deco} />
    </>
  );
}
