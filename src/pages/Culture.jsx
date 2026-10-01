import React, { Suspense, lazy } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Calendar, Heart, Lightbulb, Loader2 } from 'lucide-react';

const CultureCalendar = lazy(() => import('@/pages/CultureCalendar'));
const Recognition = lazy(() => import('@/pages/Recognition'));
const IdeaHub = lazy(() => import('@/pages/IdeaHub'));

const TABS = [
  ['calendar', 'Calendar', Calendar, CultureCalendar],
  ['recognition', 'Shout-outs', Heart, Recognition],
  ['ideas', 'Idea hub', Lightbulb, IdeaHub],
];

/** Team culture in one place: events calendar, peer shout-outs and the idea hub. */
export default function Culture() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.find(([k]) => k === params.get('tab'))?.[0] || 'calendar';
  const Page = TABS.find(([k]) => k === tab)[3];
  return (
    <div>
      <div className="sticky top-16 md:top-0 z-20 bg-background/95 backdrop-blur border-b">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-10 pt-4 flex items-end gap-1 overflow-x-auto">
          <p className="font-bold text-lg mr-4 pb-2 hidden sm:block">Culture</p>
          {TABS.map(([k, l, Icon]) => (
            <button key={k} type="button" onClick={() => setParams({ tab: k }, { replace: true })}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap ${tab === k ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
              <Icon className="w-4 h-4" /> {l}
            </button>
          ))}
        </div>
      </div>
      <Suspense fallback={<div className="py-20 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}>
        <Page key={tab} />
      </Suspense>
    </div>
  );
}
