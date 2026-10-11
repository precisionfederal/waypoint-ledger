'use client';
/* Opens a composite journey in the journey box, where the same reader a
   person's own sentence goes through reads it live. The sentence is held as
   this tab's draft (lib/store.tsx saveStoryDraft, read by JourneyBuilder on
   mount), so nothing already on the ledger is replaced: the person sees the
   lines and decides whether to add them. Without script it is a plain link. */
import { useRouter } from 'next/navigation';
import { saveStoryDraft } from '@/lib/store';

export default function OpenInTool({ story, condition, href }: { story: string; condition: string; href: string }) {
  const router = useRouter();
  return (
    <a
      className="btn primary le-open"
      href={href}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        saveStoryDraft(story);
        router.push(href);
      }}
      aria-label={`Read the ${condition} composite in the journey box`}
    >
      Read this sentence in the tool
    </a>
  );
}
