import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function MobilePageHeader({ title }) {
  const navigate = useNavigate();
  const location = useLocation();

  // Don't show on root/tab routes
  const rootPaths = ['/Dashboard', '/Chat', '/DirectMessages', '/Profile'];
  if (rootPaths.includes(location.pathname)) return null;

  return (
    <div className="lg:hidden flex items-center gap-3 -mx-6 -mt-6 px-6 py-3 border-b border-border bg-muted sticky top-0 z-30">
      <button
        onClick={() => navigate(-1)}
        className="p-2 hover:bg-background rounded-lg transition-colors select-none flex-shrink-0"
        title="Go back"
      >
        <ArrowLeft className="w-5 h-5" />
      </button>
      <h1 className="font-semibold text-foreground truncate">{title}</h1>
    </div>
  );
}