import React, { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Search, Monitor } from 'lucide-react';
import ConversationList from '@/components/dashboard/ConversationList';
import { motion } from 'framer-motion';

export default function BrokerMonitor() {
  const { user, brokerageId } = useOutletContext();
  const [statusFilter, setStatusFilter] = useState('active');
  const [search, setSearch] = useState('');

  const { data: conversations = [] } = useQuery({
    queryKey: ['all-conversations'],
    queryFn: () => base44.entities.Conversation.filter({ brokerage_id: brokerageId }, '-updated_date', 100),
    enabled: !!user && !!brokerageId,
  });

  const filtered = conversations
    .filter(c => statusFilter === 'all' || c.status === statusFilter)
    .filter(c =>
      !search ||
      c.title?.toLowerCase().includes(search.toLowerCase()) ||
      c.agent_name?.toLowerCase().includes(search.toLowerCase())
    );

  const activeCount = conversations.filter(c => c.status === 'active').length;
  const resolvedCount = conversations.filter(c => c.status === 'resolved').length;

  return (
    <div className="p-6 lg:p-10 max-w-7xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <div className="flex items-center gap-3 mb-1">
          <Monitor className="w-7 h-7 text-primary" />
          <h1 className="text-2xl lg:text-3xl font-bold text-foreground tracking-tight">
            Conversation Monitor
          </h1>
        </div>
        <p className="text-muted-foreground ml-10">
          View all agent conversations. Click any to jump in.
        </p>
      </motion.div>

      <div className="flex flex-col md:flex-row items-start md:items-center gap-4 mb-6">
        <Tabs value={statusFilter} onValueChange={setStatusFilter}>
          <TabsList>
            <TabsTrigger value="active">Active ({activeCount})</TabsTrigger>
            <TabsTrigger value="resolved">Resolved ({resolvedCount})</TabsTrigger>
            <TabsTrigger value="all">All ({conversations.length})</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by agent or topic..."
            className="pl-10 rounded-xl"
          />
        </div>
      </div>

      <ConversationList conversations={filtered} isBrokerView={true} />
    </div>
  );
}