import React, { Suspense, lazy } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Megaphone, TrendingUp, Calculator, Wand2, Loader2 } from 'lucide-react';

const Designs = lazy(() => import('@/pages/Marketing'));
const CMABuilder = lazy(() => import('@/pages/CMABuilder'));
const NetSheet = lazy(() => import('@/pages/NetSheetCalculator'));
const ListingGenerator = lazy(() => import('@/pages/ListingGenerator'));

// ?tool= picks the tool (each tool keeps its own ?tab= for its inner tabs).
const TOOLS = [
  ['design', 'Designs', Megaphone, Designs],
  ['cma', 'CMA', TrendingUp, CMABuilder],
  ['netsheet', 'Net sheet', Calculator, NetSheet],
  ['listing', 'Listing description', Wand2, ListingGenerator],
];

/** Marketing and listing-presentation tools in one place. */
export default function MarketingHub() {
  const [params, setParams] = useSearchParams();
  const tool = TOOLS.find(([k]) => k === params.get('tool'))?.[0] || 'design';
  const Page = TOOLS.find(([k]) => k === tool)[3];
  return (
    <div>
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-10 pt-4 flex items-end gap-1 overflow-x-auto">
          <p className="font-bold text-lg mr-4 pb-2 hidden sm:block">Marketing</p>
          {TOOLS.map(([k, l, Icon]) => (
            <button key={k} type="button" onClick={() => setParams(k === 'design' ? {} : { tool: k }, { replace: true })}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap ${tool === k ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
              <Icon className="w-4 h-4" /> {l}
            </button>
          ))}
        </div>
      </div>
      <Suspense fallback={<div className="py-20 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}>
        <Page key={tool} />
      </Suspense>
    </div>
  );
}
