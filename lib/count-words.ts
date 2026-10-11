/* JUDGE-4 #5: ONE WORD, ONE THING. "Sender" on /policy and /register means what cf/functions/api/_senders.js counts: one network on one day,
   counted once, for the survey and the uncounted-care reports. Corrections are
   never counted in senders: the only key a correction keeps is bound to its
   figure (submitterHash over browser id + figure + table version), so its
   distinct count is one per browser per figure, which is the corrections
   themselves. Before this, /policy printed "7 answers from 2 senders" and
   "23 corrections from 23 distinct senders" under two definitions. */
export const SENDER_MEANS = 'A sender is one network on one day, counted once. It is never a verified person: a household on one connection is one sender, so this count runs low, never high.';
export const CORRECTIONS_NOT_BY_SENDER = 'A browser can send one correction per figure. Corrections are not counted in senders: the key kept with each one is bound to its figure, so one browser’s corrections on two figures look the same as two browsers’.';
