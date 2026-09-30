import React, { useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { BarChart, Bar, PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { TrendingUp, MessageSquare, CheckCircle, Clock, Activity, DollarSign, Users } from 'lucide-react';
import { motion } from 'framer-motion';
import StatsCard from '@/components/dashboard/StatsCard';
import { cn } from '@/lib/utils';

const categoryColors = {
  transaction: '#3b82f6',
  compliance: '#f59e0b',
  marketing: '#8b5cf6',
  tech_support: '#ec4899',
  commission: '#10b981',
  training: '#06b6d4',
  general: '#6b7280',
};

export default function Analytics() {
  const { user, brokerageId } = useOutletContext();
  const isAdmin = user?.role === 'admin';

  const { data: conversations = [] } = useQuery({
    queryKey: ['all-conversations-analytics', brokerageId],
    queryFn: () => base44.entities.Conversation.filter({ brokerage_id: brokerageId }, '-created_date', 500),
    enabled: !!brokerageId,
  });

  const { data: messages = [] } = useQuery({
    queryKey: ['all-messages-analytics', brokerageId],
    queryFn: () => base44.entities.Message.filter({ brokerage_id: brokerageId }, '-created_date', 2000),
    enabled: !!brokerageId,
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ['transactions-analytics', brokerageId],
    queryFn: () => base44.entities.Transaction.filter({ brokerage_id: brokerageId }, '-created_date', 500),
    enabled: !!brokerageId,
  });

  const commissionStats = useMemo(() => {
    const map = {};
    let totalCommission = 0;
    transactions.forEach(tx => {
      if (!tx.commission_amount) return;
      const key = tx.agent_email;
      if (!map[key]) map[key] = { name: tx.agent_name || tx.agent_email, email: key, total: 0, count: 0 };
      map[key].total += parseFloat(tx.commission_amount);
      map[key].count += 1;
      totalCommission += parseFloat(tx.commission_amount);
    });
    const agentStats = Object.values(map).sort((a, b) => b.total - a.total);
    return { agentStats, totalCommission };
  }, [transactions]);

  const metrics = useMemo(() => {
    const last30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const conversationsLast30 = conversations.filter(c => new Date(c.created_date) > last30Days);

    // Resolved vs Active
    const resolved = conversationsLast30.filter(c => c.status === 'resolved').length;
    const active = conversationsLast30.filter(c => c.status === 'active').length;

    // Category breakdown
    const categoryData = {};
    conversationsLast30.forEach(c => {
      const cat = c.category || 'general';
      categoryData[cat] = (categoryData[cat] || 0) + 1;
    });
    const categoryBreakdown = Object.entries(categoryData).map(([name, value]) => ({
      name: name.replace('_', ' ').charAt(0).toUpperCase() + name.slice(1).replace('_', ' '),
      value,
    }));

    // Response time per agent
    const agentResponseTimes = {};
    conversationsLast30.forEach(conv => {
      const convMessages = messages.filter(m => m.conversation_id === conv.id).sort((a, b) => 
        new Date(a.created_date) - new Date(b.created_date)
      );

      convMessages.forEach((msg, idx) => {
        if (msg.sender_role === 'agent' && idx + 1 < convMessages.length) {
          const nextMsg = convMessages[idx + 1];
          if (nextMsg.sender_role === 'ai' || nextMsg.sender_role === 'broker') {
            const responseTime = (new Date(nextMsg.created_date) - new Date(msg.created_date)) / 1000 / 60; // in minutes
            if (!agentResponseTimes[msg.sender_name]) {
              agentResponseTimes[msg.sender_name] = { times: [], agent: msg.sender_name };
            }
            agentResponseTimes[msg.sender_name].times.push(responseTime);
          }
        }
      });
    });

    const agentMetrics = Object.values(agentResponseTimes).map(agent => ({
      agent: agent.agent,
      avgResponseTime: Math.round(agent.times.reduce((a, b) => a + b, 0) / agent.times.length),
    })).sort((a, b) => a.avgResponseTime - b.avgResponseTime);

    // Daily conversation trend
    const dailyData = {};
    conversationsLast30.forEach(c => {
      const date = new Date(c.created_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      dailyData[date] = (dailyData[date] || 0) + 1;
    });
    const trendData = Object.entries(dailyData).map(([date, count]) => ({ date, conversations: count })).slice(-14);

    return {
      resolved,
      active,
      categoryBreakdown,
      agentMetrics,
      trendData,
      totalConversations: conversationsLast30.length,
    };
  }, [conversations, messages]);

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <div className="text-center">
          <TrendingUp className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground">Analytics available for brokers only.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/30 p-6 lg:p-10">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-12">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <Activity className="w-5 h-5 text-primary-foreground" />
            </div>
            <h1 className="text-3xl lg:text-4xl font-bold text-foreground tracking-tight">Analytics</h1>
          </div>
          <p className="text-muted-foreground text-sm">Last 30 days performance overview</p>
        </motion.div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-12">
          {[
            { title: 'Total Conversations', value: metrics.totalConversations, icon: MessageSquare, gradient: 'from-blue-500 to-blue-600' },
            { title: 'Resolved', value: metrics.resolved, icon: CheckCircle, gradient: 'from-green-500 to-green-600' },
            { title: 'Active', value: metrics.active, icon: Clock, gradient: 'from-orange-500 to-orange-600' },
            { 
              title: 'Avg Response Time', 
              value: metrics.agentMetrics.length > 0 ? `${Math.round(metrics.agentMetrics.reduce((a, b) => a + b.avgResponseTime, 0) / metrics.agentMetrics.length)}m` : 'N/A', 
              icon: TrendingUp, 
              gradient: 'from-purple-500 to-purple-600' 
            }
          ].map((stat, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="bg-card border border-border/50 rounded-xl p-5 hover:border-border/80 transition-all duration-300 group"
            >
              <div className="flex items-start justify-between mb-3">
                <div className={cn("w-10 h-10 rounded-lg bg-gradient-to-br flex items-center justify-center text-white group-hover:scale-110 transition-transform", stat.gradient)}>
                  <stat.icon className="w-5 h-5" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground font-medium mb-1">{stat.title}</p>
              <p className="text-2xl font-bold text-foreground">{stat.value}</p>
            </motion.div>
          ))}
        </div>

      {/* Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-12">
          {/* Resolved vs Active */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-card border border-border/50 rounded-xl p-6 hover:border-border/80 transition-all">
            <h3 className="text-sm font-semibold text-foreground mb-6 flex items-center gap-2">
              <div className="w-1 h-4 bg-gradient-to-b from-primary to-accent rounded-full" />
              Ticket Status
            </h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={[{ status: 'Resolved', count: metrics.resolved }, { status: 'Active', count: metrics.active }]}>
                <CartesianGrid strokeDasharray="0" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="status" stroke="var(--color-muted-foreground)" style={{ fontSize: '12px' }} />
                <YAxis stroke="var(--color-muted-foreground)" style={{ fontSize: '12px' }} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)', borderRadius: '8px' }} 
                  cursor={{ fill: 'rgba(59, 130, 246, 0.1)' }}
                />
                <Bar dataKey="count" fill="url(#barGradient)" radius={[12, 12, 0, 0]} />
                <defs>
                  <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-primary)" />
                    <stop offset="100%" stopColor="var(--color-accent)" />
                  </linearGradient>
                </defs>
              </BarChart>
            </ResponsiveContainer>
          </motion.div>

          {/* Category Breakdown */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="bg-card border border-border/50 rounded-xl p-6 hover:border-border/80 transition-all">
            <h3 className="text-sm font-semibold text-foreground mb-6 flex items-center gap-2">
              <div className="w-1 h-4 bg-gradient-to-b from-primary to-accent rounded-full" />
              Conversations by Category
            </h3>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={metrics.categoryBreakdown}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`}
                  outerRadius={75}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {metrics.categoryBreakdown.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={categoryColors[entry.name.toLowerCase().replace(' ', '_')] || '#8b5cf6'} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)', borderRadius: '8px' }} />
              </PieChart>
            </ResponsiveContainer>
          </motion.div>
        </div>

      {/* Conversation Trend */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="bg-card border border-border/50 rounded-xl p-6 mb-12 hover:border-border/80 transition-all">
          <h3 className="text-sm font-semibold text-foreground mb-6 flex items-center gap-2">
            <div className="w-1 h-4 bg-gradient-to-b from-primary to-accent rounded-full" />
            Conversation Trend (Last 14 Days)
          </h3>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={metrics.trendData}>
              <defs>
                <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="0" stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="date" stroke="var(--color-muted-foreground)" style={{ fontSize: '12px' }} />
              <YAxis stroke="var(--color-muted-foreground)" style={{ fontSize: '12px' }} />
              <Tooltip contentStyle={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)', borderRadius: '8px' }} />
              <Area type="monotone" dataKey="conversations" stroke="var(--color-primary)" strokeWidth={2} fill="#3b82f6" fillOpacity={0.1} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </motion.div>

        {/* Commission Overview */}
        {commissionStats.agentStats.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }} className="mb-12">
            <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
              <div className="w-1 h-4 bg-gradient-to-b from-green-500 to-emerald-600 rounded-full" />
              Commission Overview
            </h3>

            {/* Summary cards */}
            <div className="grid grid-cols-3 gap-3 mb-5">
              <div className="bg-card border border-border/50 rounded-xl p-4">
                <p className="text-xs text-muted-foreground flex items-center gap-1"><DollarSign className="w-3 h-3" /> Total Commission</p>
                <p className="text-xl font-bold text-green-700 mt-1">${commissionStats.totalCommission.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              </div>
              <div className="bg-card border border-border/50 rounded-xl p-4">
                <p className="text-xs text-muted-foreground flex items-center gap-1"><Users className="w-3 h-3" /> Agents Earning</p>
                <p className="text-xl font-bold mt-1">{commissionStats.agentStats.length}</p>
              </div>
              <div className="bg-card border border-border/50 rounded-xl p-4">
                <p className="text-xs text-muted-foreground">Avg per Agent</p>
                <p className="text-xl font-bold mt-1">${(commissionStats.totalCommission / commissionStats.agentStats.length).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              </div>
            </div>

            {/* Bar chart */}
            <div className="bg-card border border-border/50 rounded-xl p-6 mb-4 hover:border-border/80 transition-all">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Commission by Agent</p>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={commissionStats.agentStats} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="0" stroke="var(--color-border)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} tickFormatter={n => n.split(' ')[0]} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => v >= 1000 ? `$${(v/1000).toFixed(1)}k` : `$${v}`} />
                  <Tooltip formatter={(v) => `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} labelStyle={{ fontWeight: 600 }} contentStyle={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)', borderRadius: '8px' }} />
                  <Bar dataKey="total" radius={[6, 6, 0, 0]} fill="url(#commissionGradient)" />
                  <defs>
                    <linearGradient id="commissionGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" />
                      <stop offset="100%" stopColor="#059669" />
                    </linearGradient>
                  </defs>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Agent ranking */}
            <div className="bg-card border border-border/50 rounded-xl overflow-hidden">
              <div className="divide-y divide-border/40">
                {commissionStats.agentStats.map((agent, i) => (
                  <div key={agent.email} className="flex items-center gap-3 px-5 py-3">
                    <span className="text-xs font-bold text-muted-foreground w-5">#{i + 1}</span>
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                      {agent.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{agent.name}</p>
                      <p className="text-xs text-muted-foreground">{agent.count} transaction{agent.count !== 1 ? 's' : ''}</p>
                    </div>
                    <p className="text-sm font-bold text-green-700">${agent.total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {/* Agent Response Times */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="bg-card border border-border/50 rounded-xl p-6 hover:border-border/80 transition-all">
          <h3 className="text-sm font-semibold text-foreground mb-6 flex items-center gap-2">
            <div className="w-1 h-4 bg-gradient-to-b from-primary to-accent rounded-full" />
            Average Response Time by Agent
          </h3>
          <ResponsiveContainer width="100%" height={Math.max(metrics.agentMetrics.length * 50, 250)}>
            <BarChart data={metrics.agentMetrics} layout="vertical" margin={{ left: 130 }}>
              <defs>
                <linearGradient id="agentGradient" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="var(--color-accent)" />
                  <stop offset="100%" stopColor="var(--color-primary)" />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="0" stroke="var(--color-border)" vertical />
              <XAxis type="number" stroke="var(--color-muted-foreground)" style={{ fontSize: '12px' }} />
              <YAxis dataKey="agent" type="category" stroke="var(--color-muted-foreground)" width={120} tick={{ fontSize: '11px' }} />
              <Tooltip 
                contentStyle={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)', borderRadius: '8px' }} 
                formatter={(value) => `${value}m`}
              />
              <Bar dataKey="avgResponseTime" fill="url(#agentGradient)" radius={[0, 10, 10, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </motion.div>
      </div>
    </div>
  );
}