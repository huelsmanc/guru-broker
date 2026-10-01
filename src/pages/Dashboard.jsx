import React, { useState, useRef, useEffect } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { MessageSquare, Phone, Clock, UserCheck, Plus, ArrowRight, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import StatsCard from '@/components/dashboard/StatsCard';
import ConversationList from '@/components/dashboard/ConversationList';
import NewConversationDialog from '@/components/chat/NewConversationDialog';
import AnnouncementBoard from '@/components/dashboard/AnnouncementBoard';
import AudioAnnouncement from '@/components/dashboard/AudioAnnouncement';
import SocialFeedWidget from '@/components/dashboard/SocialFeedWidget';
import NotificationsDropdown from '@/components/dashboard/NotificationsDropdown';
import MobileSafeScroll from '@/components/layout/MobileSafeScroll';
import MyDay from '@/components/dashboard/MyDay';

import { motion } from 'framer-motion';
import { isAdminRole, normalizeRole, can } from '../../shared/permissions.generated.js';


export default function Dashboard() {
  const { user, brokerageId } = useOutletContext();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showNewConvo, setShowNewConvo] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const isAdmin = isAdminRole(user?.role);

  const { data: brokerageSettings } = useQuery({
    queryKey: ['brokerage-settings', brokerageId],
    queryFn: () => base44.entities.BrokerageSettings.filter({ brokerage_id: brokerageId }).then(results => results[0] || null),
    enabled: !!brokerageId,
  });

  const handleRefresh = async () => {
    await queryClient.invalidateQueries();
  };

  const { data: conversations = [] } = useQuery({
    queryKey: ['conversations', user?.email],
    queryFn: () => isAdmin
      ? base44.entities.Conversation.filter({ brokerage_id: brokerageId }, '-updated_date', 50)
      : base44.entities.Conversation.filter({ agent_email: user?.email, brokerage_id: brokerageId }, '-updated_date', 50),
    enabled: !!user && !!brokerageId,
  });

  const { data: calls = [] } = useQuery({
    queryKey: ['calls', user?.email],
    queryFn: () => isAdmin
      ? base44.entities.ScheduledCall.filter({ brokerage_id: brokerageId, status: 'scheduled' }, '-created_date', 50)
      : base44.entities.ScheduledCall.filter({ agent_email: user?.email, brokerage_id: brokerageId, status: 'scheduled' }, '-created_date', 50),
    enabled: !!user && !!brokerageId,
  });

  const currentMonth = new Date().toISOString().slice(0, 7);

  const { data: leaderboard = [] } = useQuery({
    queryKey: ['agent-sales-dashboard', brokerageId, currentMonth],
    queryFn: () => base44.entities.AgentSales.filter(
      { brokerage_id: brokerageId, month: `${currentMonth}-01` },
      '-sales_amount',
      10
    ),
    enabled: !!brokerageId && !isAdmin,
  });

  const activeConvos = conversations.filter(c => c.status === 'active');
  const aiHandled = conversations.filter(c => c.handled_by === 'ai' && c.status === 'active');
  const brokerHandled = conversations.filter(c => c.handled_by === 'broker' && c.status === 'active');

  const handleCreate = async ({ title, category, firstMessage }) => {
    const convo = await base44.entities.Conversation.create({
      title,
      category,
      agent_email: user.email,
      agent_name: user.full_name,
      brokerage_id: brokerageId,
      status: 'active',
      handled_by: 'ai',
      last_message_preview: firstMessage,
    });
    await base44.entities.Message.create({
      conversation_id: convo.id,
      brokerage_id: brokerageId,
      sender_role: 'agent',
      sender_name: user.full_name,
      sender_email: user.email,
      content: firstMessage,
    });

    setShowNewConvo(false);
    navigate(`/Chat?id=${convo.id}&typing=1`);
  };

  return (
    <MobileSafeScroll 
      onRefresh={handleRefresh}
      className="lg:overflow-visible"
    >
    <div className="p-6 lg:p-10 max-w-7xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8"
      >
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl lg:text-3xl font-bold text-foreground tracking-tight">
              {`${new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening'}, ${user?.full_name?.split(' ')[0] || ''}`}
            </h1>
            <NotificationsDropdown user={user} brokerageId={brokerageId} />
          </div>
          <p className="text-muted-foreground mt-1">
            {isAdmin
              ? 'Monitor and manage all agent conversations'
              : brokerageSettings
                ? `${brokerageSettings.welcome_message || `Get instant support from ${brokerageSettings.broker_name}`}`
                : 'Get instant support from your broker'}
          </p>
        </div>
        <div className="flex items-center gap-4">
          {!isAdmin && (
            <Button onClick={() => setShowNewConvo(true)} className="gap-2 rounded-xl min-h-[44px] px-4 text-sm font-medium">
              <Plus className="w-5 h-5" />
              New Conversation
            </Button>
          )}
        </div>
      </motion.div>

      <MyDay />

      <div className="mb-10">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <AnnouncementBoard brokerageId={brokerageId} user={user} isAdmin={isAdmin} />
          <AudioAnnouncement brokerageId={brokerageId} user={user} isAdmin={isAdmin} />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
          <div className="lg:col-span-3">
            <SocialFeedWidget brokerageId={brokerageId} user={user} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        <StatsCard title="Active Chats" value={activeConvos.length} icon={MessageSquare} color="bg-primary" />
        <StatsCard title="Auto Support" value={aiHandled.length} icon={Clock} color="bg-accent" />
        <StatsCard title="Broker Handled" value={brokerHandled.length} icon={UserCheck} color="bg-chart-3" />
        <StatsCard title="Upcoming Calls" value={calls.length} icon={Phone} color="bg-chart-4" />
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Conversations Column */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground">
              {isAdmin ? 'All Conversations' : 'Your Conversations'}
            </h2>
            {isAdmin && (
              <Button variant="ghost" onClick={() => navigate('/BrokerMonitor')} className="gap-1 text-sm text-muted-foreground">
                View all <ArrowRight className="w-4 h-4" />
              </Button>
            )}
          </div>
          <ConversationList conversations={conversations.slice(0, 10)} isBrokerView={isAdmin} />
        </div>

        {/* Right Column: Sales Leaderboard (agents only) */}
        {!isAdmin && leaderboard.length > 0 && (
          <div className="lg:w-80 flex-shrink-0">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Trophy className="w-5 h-5 text-yellow-500" />
                <h2 className="text-lg font-semibold text-foreground">Sales Leaderboard</h2>
              </div>
              <p className="text-sm text-muted-foreground -mt-3 mb-4">{new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}</p>
              <div className="space-y-2">
                {leaderboard.map((sale, idx) => (
                  <motion.div
                    key={sale.id}
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.04 }}
                    className={`flex items-center gap-3 bg-card rounded-xl border px-4 py-3 ${sale.agent_email === user?.email ? 'border-primary/40 bg-primary/5' : 'border-border'}`}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm flex-shrink-0 ${
                      idx === 0 ? 'bg-yellow-400/20 text-yellow-600' :
                      idx === 1 ? 'bg-gray-300/30 text-gray-600' :
                      idx === 2 ? 'bg-orange-400/20 text-orange-600' :
                      'bg-muted text-muted-foreground'
                    }`}>
                      #{idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-foreground truncate">
                        {sale.agent_name}
                        {sale.agent_email === user?.email && <span className="ml-1 text-xs text-primary font-normal">(You)</span>}
                      </p>
                    </div>
                    <p className="font-bold text-sm text-foreground flex-shrink-0">${(sale.sales_amount / 1000000).toFixed(1)}M</p>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <NewConversationDialog
        open={showNewConvo}
        onClose={() => setShowNewConvo(false)}
        onCreate={handleCreate}
      />


    </div>
    </MobileSafeScroll>
  );
}