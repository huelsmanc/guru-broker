import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Home, MessageSquare, Mail, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTabHistory } from './MobileTabBarProvider';

export default function MobileTabBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { saveNavigation, getLastPath } = useTabHistory();

  const tabs = [
    { name: 'Dashboard', path: '/Dashboard', icon: Home },
    { name: 'Support Chat', path: '/Chat', icon: MessageSquare },
    { name: 'Messages', path: '/DirectMessages', icon: Mail },
    { name: 'Profile', path: '/Profile', icon: User },
  ];

  // Determine which tab is active based on current path
  const getActiveTab = () => {
    for (const tab of tabs) {
      if (location.pathname === tab.path || location.pathname.startsWith(tab.path + '/')) {
        return tab.path;
      }
    }
    return '/Dashboard';
  };

  const activeTab = getActiveTab();
  const isActive = (path) => getActiveTab() === path;

  const handleTabClick = (path) => {
    // If re-selecting same tab, reset to root path
    if (getActiveTab() === path) {
      saveNavigation(path, path);
      navigate(path);
    } else {
      saveNavigation(path, path);
      navigate(path);
    }
  };

  return (
    <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-card border-t border-border z-40">
      <div className="flex items-center justify-around h-20" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = isActive(tab.path);
          return (
            <button
                 key={tab.path}
                 onClick={() => handleTabClick(tab.path)}
                 aria-label={tab.name}
                 className={cn(
                   'flex flex-col items-center justify-center gap-1 flex-1 min-h-[44px] transition-colors select-none active:opacity-70',
                   active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                 )}
               >
                <Icon className="w-6 h-6" />
                <span className="text-xs font-medium leading-tight">{tab.name}</span>
              </button>
          );
        })}
      </div>
    </div>
  );
}