'use client';
/* ==========================================================================
   next/link without prefetch-on-sight.

   Next's default prefetches every link the moment it scrolls into view. On this
   static export each prefetched payload carries its route's stylesheet hints,
   and React turns those into <link rel=preload as=style>: the home page alone
   fetched seven other routes' payloads and preloaded eight stylesheets it never
   used (Chromium warned about each one), and a WebKit page left mid-prefetch
   logged each cancelled payload as a failed fetch. Every Link here is cold; the
   Shell warms a route when a person presses or touches its link, a beat
   before the click that uses it (components/Shell.tsx, useIntentPrefetch),
   so a page loads only its own CSS. Kept to one line: it ships in every route.
   ========================================================================== */
import NextLink from 'next/link';
import type { ComponentProps } from 'react';

export default function Link(p: ComponentProps<typeof NextLink>) { return <NextLink prefetch={false} {...p} />; }
