import React, { useState, useEffect } from 'react';
import { Users, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function ChannelMembersList({ members, activeUsers, getUserPhoto }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        title="Channel members"
      >
        <Users className="w-4 h-4" />
        <span>{members.length}</span>
        <ChevronDown className={cn('w-3 h-3 transition-transform', isOpen && 'rotate-180')} />
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-48 bg-card border border-border rounded-lg shadow-lg z-50">
          <div className="max-h-64 overflow-y-auto">
            {members.length === 0 ? (
              <div className="p-3 text-xs text-muted-foreground text-center">No members yet</div>
            ) : (
              members.map((member) => {
                const isActive = activeUsers.has(member.user_email);
                const photo = getUserPhoto(member.user_email);
                
                return (
                  <div
                    key={member.id}
                    className="flex items-center gap-2 px-3 py-2 hover:bg-muted/50 transition-colors border-b border-border last:border-b-0"
                  >
                    <div className="relative flex-shrink-0">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold overflow-hidden bg-gradient-to-br from-primary/20 to-accent/20">
                        {photo ? (
                          <img src={photo} alt={member.user_name} className="w-full h-full object-cover" />
                        ) : (
                          member.user_name?.[0]?.toUpperCase()
                        )}
                      </div>
                      {isActive && (
                        <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full border border-card" title="Online" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{member.user_name}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{member.user_email}</p>
                    </div>
                    {isActive && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                        Online
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}