import React from 'react';
import { useOutletContext, Link } from 'react-router-dom';
import { isAdminRole } from '../../shared/permissions.generated.js';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { ExternalLink } from 'lucide-react';
import { motion } from 'framer-motion';

export default function TechLinks() {
  const { user, brokerageId } = useOutletContext();

  const { data: settings } = useQuery({
    queryKey: ['brokerage-settings', brokerageId],
    queryFn: () => base44.entities.BrokerageSettings.filter({ brokerage_id: brokerageId }),
    enabled: !!brokerageId,
  });

  const links = settings?.[0]?.tech_links || [];

  // Group by category
  const grouped = links.reduce((acc, link) => {
    const cat = link.category || 'Other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(link);
    return acc;
  }, {});

  return (
    <div className="p-6 lg:p-10 max-w-4xl mx-auto">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <h1 className="text-2xl lg:text-3xl font-bold text-foreground tracking-tight">🔗 Tech Stack</h1>
        <p className="text-muted-foreground mt-1">Quick access to your brokerage tools and websites</p>
      </motion.div>

      {links.length === 0 ? (
        <div className="text-center py-24 text-muted-foreground">
          <p className="text-4xl mb-3">🔗</p>
          <p className="font-medium text-foreground">No links added yet</p>
          {isAdminRole(user?.role)
            ? <p className="text-sm mt-1">Add them in <Link to="/Settings" className="text-primary underline">Settings → Tech Links</Link>.</p>
            : <p className="text-sm mt-1">Ask your broker to add tech tools in Settings.</p>}
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(grouped).map(([category, items], i) => (
            <motion.div
              key={category}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">{category}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {items.map((link) => (
                  <a
                    key={link.id}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex items-center gap-3 bg-card border border-border rounded-xl px-4 py-4 hover:shadow-md hover:border-primary/30 transition-all"
                  >
                    <span className="text-2xl flex-shrink-0">{link.icon || '🔗'}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors truncate">{link.label}</p>
                      <p className="text-xs text-muted-foreground truncate">{link.url.replace(/^https?:\/\//, '')}</p>
                    </div>
                    <ExternalLink className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                  </a>
                ))}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}