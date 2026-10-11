'use client';
import { useEffect } from 'react';

/* patient-17: the meta refresh moves a browser that loads /signal from the
   server; this moves one that arrives by a client navigation, and replace()
   keeps the stub out of the history, so Back never lands on "moved". */
export default function Go() {
  useEffect(() => { window.location.replace('/register/live'); }, []);
  return null;
}
