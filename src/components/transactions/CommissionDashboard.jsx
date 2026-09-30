import React, { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { DollarSign, TrendingUp, Users } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const COLORS = ['#667eea', '#48bb78', '#ed8936', '#9f7aea', '#38b2ac', '#e53e3e', '#ecc94b'];

export default function CommissionDashboard({ transactions }) {
  const { agentStats, totalCommission, totalClosed } = useMemo(() => {
    const map = {};
    let total = 0;
    let closed = 0;

    transactions.forEach(tx => {
      if (!tx.commission_amount) return;
      const key = tx.agent_email;
      if (!map[key]) map[key] = { name: tx.agent_name || tx.agent_email, email: key, total: 0, count: 0 };
      map[key].total += parseFloat(tx.commission_amount);
      map[key].count += 1;
      total += parseFloat(tx.commission_amount);
      if (tx.status === 'closed') closed += 1;
    });

    const sorted = Object.values(map).sort((a, b) => b.total - a.total);
    return { agentStats: sorted, totalCommission: total, totalClosed: closed };
  }, [transactions]);

  const fmt = (v) => v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v.toFixed(0)}`;
  const fmtFull = (v) => `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  if (agentStats.length === 0) return null;

  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp className="w-5 h-5 text-primary" />
        <h2 className="text-base font-semibold text-foreground">Commission Overview</h2>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <Card className="p-4 border-border/40 bg-gradient-to-br from-green-50 to-emerald-50">
          <p className="text-xs text-muted-foreground flex items-center gap-1"><DollarSign className="w-3 h-3" /> Total Commission</p>
          <p className="text-xl font-bold text-green-700 mt-1">{fmtFull(totalCommission)}</p>
        </Card>
        <Card className="p-4 border-border/40">
          <p className="text-xs text-muted-foreground flex items-center gap-1"><Users className="w-3 h-3" /> Agents Earning</p>
          <p className="text-xl font-bold mt-1">{agentStats.length}</p>
        </Card>
        <Card className="p-4 border-border/40">
          <p className="text-xs text-muted-foreground">Avg per Agent</p>
          <p className="text-xl font-bold mt-1">{fmtFull(totalCommission / agentStats.length)}</p>
        </Card>
      </div>

      {/* Bar chart */}
      <Card className="p-4 border-border/40 mb-4">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Commission by Agent</p>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={agentStats} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
            <XAxis dataKey="name" tick={{ fontSize: 11 }} tickFormatter={n => n.split(' ')[0]} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={fmt} />
            <Tooltip formatter={(v) => fmtFull(v)} labelStyle={{ fontWeight: 600 }} />
            <Bar dataKey="total" radius={[4, 4, 0, 0]}>
              {agentStats.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* Agent table */}
      <Card className="border-border/40 overflow-hidden">
        <div className="divide-y divide-border/40">
          {agentStats.map((agent, i) => (
            <div key={agent.email} className="flex items-center gap-3 px-4 py-3">
              <span className="text-xs font-bold text-muted-foreground w-5">#{i + 1}</span>
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                style={{ backgroundColor: COLORS[i % COLORS.length] }}
              >
                {agent.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{agent.name}</p>
                <p className="text-xs text-muted-foreground">{agent.count} transaction{agent.count !== 1 ? 's' : ''}</p>
              </div>
              <p className="text-sm font-bold text-green-700">{fmtFull(agent.total)}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}