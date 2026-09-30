import React, { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { FileText, CheckCircle, Clock, Send, TrendingUp, Activity } from 'lucide-react';
import { format } from 'date-fns';
import { motion } from 'framer-motion';

export default function ESignAdmin() {
  const { user, brokerageId } = useOutletContext();
  const [selectedDay, setSelectedDay] = useState(7); // Last 7 days

  // Verify admin access
  if (user?.role !== 'admin') {
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground">Admin access required</p>
      </div>
    );
  }

  // Fetch documents
  const { data: documents = [] } = useQuery({
    queryKey: ['admin-esign-documents', brokerageId],
    queryFn: () => base44.entities.ESignDocument.filter({ brokerage_id: brokerageId }, '-created_date', 500),
    enabled: !!brokerageId,
  });

  // Fetch activity logs
  const { data: activityLogs = [] } = useQuery({
    queryKey: ['admin-activity-logs', brokerageId],
    queryFn: () => base44.entities.ActivityLog.filter({ brokerage_id: brokerageId }, '-created_date', 1000),
    enabled: !!brokerageId,
  });

  // Calculate metrics
  const metrics = React.useMemo(() => {
    const now = Date.now();
    const dayInMs = 24 * 60 * 60 * 1000;
    const cutoffDate = now - selectedDay * dayInMs;

    const recentDocs = documents.filter(d => new Date(d.created_date).getTime() > cutoffDate);
    const signed = recentDocs.filter(d => d.status === 'signed').length;
    const pending = recentDocs.filter(d => d.status === 'pending').length;
    const draft = recentDocs.filter(d => d.status === 'draft').length;

    // Calculate completion rate
    const completionRate = recentDocs.length > 0 ? Math.round((signed / recentDocs.length) * 100) : 0;

    // Activity by type
    const recentActivity = activityLogs.filter(a => new Date(a.created_date).getTime() > cutoffDate);
    const signings = recentActivity.filter(a => a.action_type === 'signed').length;
    const views = recentActivity.filter(a => a.action_type === 'viewed').length;
    const uploads = recentActivity.filter(a => a.action_type === 'uploaded').length;

    // Signings by day (for line chart)
    const signingsByDay = {};
    for (let i = 0; i < selectedDay; i++) {
      const date = new Date(now - i * dayInMs);
      const dayKey = format(date, 'MMM d');
      signingsByDay[dayKey] = 0;
    }

    recentActivity
      .filter(a => a.action_type === 'signed')
      .forEach(a => {
        const dayKey = format(new Date(a.created_date), 'MMM d');
        signingsByDay[dayKey] = (signingsByDay[dayKey] || 0) + 1;
      });

    const signingsTrendData = Object.entries(signingsByDay)
      .reverse()
      .map(([date, count]) => ({ date, signings: count }));

    // Document status distribution
    const statusDistribution = [
      { name: 'Signed', value: signed, fill: '#10b981' },
      { name: 'Pending', value: pending, fill: '#f59e0b' },
      { name: 'Draft', value: draft, fill: '#6b7280' },
    ].filter(s => s.value > 0);

    // Top signers
    const signerActivity = {};
    recentActivity
      .filter(a => a.action_type === 'signed')
      .forEach(a => {
        if (!signerActivity[a.user_email]) {
          signerActivity[a.user_email] = { name: a.user_name, email: a.user_email, count: 0 };
        }
        signerActivity[a.user_email].count += 1;
      });

    const topSigners = Object.values(signerActivity)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      total: recentDocs.length,
      signed,
      pending,
      draft,
      completionRate,
      signings,
      views,
      uploads,
      signingsTrendData,
      statusDistribution,
      topSigners,
    };
  }, [documents, activityLogs, selectedDay]);

  // Get recent activity
  const recentActivities = activityLogs.slice(0, 15);

  const statCard = (icon, label, value, subtext, color = 'primary') => (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card rounded-2xl border border-border p-6"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-3xl font-bold text-foreground mt-2">{value}</p>
          {subtext && <p className="text-xs text-muted-foreground mt-1">{subtext}</p>}
        </div>
        <div className={`p-3 rounded-xl bg-${color}/10`}>
          {React.cloneElement(icon, { className: `w-6 h-6 text-${color}` })}
        </div>
      </div>
    </motion.div>
  );

  return (
    <div className="p-6 lg:p-10 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground tracking-tight">E-Signature Admin Dashboard</h1>
        <p className="text-muted-foreground mt-1">Track document signing metrics and signer activity</p>
      </div>

      {/* Date Range Filter */}
      <div className="flex gap-2 mb-8">
        {[7, 30, 90].map(days => (
          <Button
            key={days}
            variant={selectedDay === days ? 'default' : 'outline'}
            onClick={() => setSelectedDay(days)}
            className="rounded-lg text-sm"
          >
            Last {days} days
          </Button>
        ))}
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {statCard(<Send className="w-6 h-6" />, 'Documents Sent', metrics.total, `${metrics.draft} draft`, 'primary')}
        {statCard(<CheckCircle className="w-6 h-6" />, 'Documents Signed', metrics.signed, `${metrics.completionRate}% complete`, 'accent')}
        {statCard(<Clock className="w-6 h-6" />, 'Pending Signatures', metrics.pending, 'awaiting signatories', 'yellow')}
        {statCard(<TrendingUp className="w-6 h-6" />, 'Total Signings', metrics.signings, `${metrics.views} views`, 'blue')}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Signings Trend */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="lg:col-span-2 bg-card rounded-2xl border border-border p-6"
        >
          <h2 className="text-lg font-semibold text-foreground mb-4">Signings Over Time</h2>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={metrics.signingsTrendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" stroke="var(--muted-foreground)" style={{ fontSize: '12px' }} />
              <YAxis stroke="var(--muted-foreground)" style={{ fontSize: '12px' }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--card)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                }}
              />
              <Line type="monotone" dataKey="signings" stroke="var(--primary)" strokeWidth={2} dot={{ fill: 'var(--primary)' }} />
            </LineChart>
          </ResponsiveContainer>
        </motion.div>

        {/* Status Distribution */}
        {metrics.statusDistribution.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-card rounded-2xl border border-border p-6"
          >
            <h2 className="text-lg font-semibold text-foreground mb-4">Document Status</h2>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={metrics.statusDistribution}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value }) => `${name} (${value})`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {metrics.statusDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--card)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </motion.div>
        )}
      </div>

      {/* Top Signers */}
      {metrics.topSigners.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card rounded-2xl border border-border p-6 mb-8"
        >
          <h2 className="text-lg font-semibold text-foreground mb-4">Top Signers</h2>
          <div className="space-y-2">
            {metrics.topSigners.map((signer, idx) => (
              <div key={signer.email} className="flex items-center justify-between p-3 rounded-lg bg-muted">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-sm font-bold text-primary">
                    {idx + 1}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{signer.name}</p>
                    <p className="text-xs text-muted-foreground">{signer.email}</p>
                  </div>
                </div>
                <Badge className="bg-accent/20 text-accent border-0">{signer.count} signed</Badge>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Recent Activity */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-card rounded-2xl border border-border p-6"
      >
        <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
          <Activity className="w-5 h-5" /> Recent Activity
        </h2>
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {recentActivities.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No activity yet</p>
          ) : (
            recentActivities.map((activity) => {
              const actionColors = {
                uploaded: 'bg-primary/10 text-primary',
                viewed: 'bg-blue-500/10 text-blue-600',
                signed: 'bg-accent/10 text-accent',
              };

              const actionLabels = {
                uploaded: 'Uploaded',
                viewed: 'Viewed',
                signed: 'Signed',
              };

              return (
                <div key={activity.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 border border-border/50">
                  <Badge className={`${actionColors[activity.action_type]} border-0 text-xs`}>
                    {actionLabels[activity.action_type]}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground">
                      <span className="font-medium">{activity.user_name}</span> {actionLabels[activity.action_type].toLowerCase()}
                    </p>
                    <p className="text-xs text-muted-foreground">{activity.user_email}</p>
                    {activity.details && <p className="text-xs text-muted-foreground mt-1">{activity.details}</p>}
                  </div>
                  <span className="text-xs text-muted-foreground flex-shrink-0 whitespace-nowrap">
                    {format(new Date(activity.created_date), 'MMM d, h:mm a')}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </motion.div>
    </div>
  );
}