import React, { useState, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Trophy, Plus, Edit2, Trash2, DollarSign } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { isAdminRole, normalizeRole, can } from '../../shared/permissions.generated.js';

export default function AgentLeaderboard() {
  const { user, brokerageId } = useOutletContext();
  const queryClient = useQueryClient();
  const isAdmin = isAdminRole(user?.role);
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [currentMonth, setCurrentMonth] = useState(new Date().toISOString().slice(0, 7));
  const [form, setForm] = useState({ agent_name: '', agent_email: '', sales_amount: '' });

  // Get all agents in brokerage
  const { data: allUsers = [] } = useQuery({
    queryKey: ['brokerage-agents', brokerageId],
    queryFn: async () => {
      const all = await base44.entities.User.list('-created_date', 500);
      return all.filter(u => u.brokerage_id === brokerageId);
    },
    enabled: !!brokerageId && isAdmin,
  });

  // Get sales for current month
  const { data: sales = [] } = useQuery({
    queryKey: ['agent-sales', brokerageId, currentMonth],
    queryFn: () => {
      const monthStart = `${currentMonth}-01`;
      return base44.entities.AgentSales.filter({ 
        brokerage_id: brokerageId,
        month: monthStart 
      }, '-sales_amount', 500);
    },
    enabled: !!brokerageId,
  });

  // Sort and rank sales
  const rankedSales = useMemo(() => {
    return sales.map((sale, idx) => ({ ...sale, rank: idx + 1 })).slice(0, 10);
  }, [sales]);

  const createSale = useMutation({
    mutationFn: async (data) => {
      const monthStart = `${currentMonth}-01`;
      await base44.entities.AgentSales.create({
        brokerage_id: brokerageId,
        agent_id: data.agent_email,
        agent_name: data.agent_name,
        agent_email: data.agent_email,
        month: monthStart,
        sales_amount: parseFloat(data.sales_amount),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-sales', brokerageId, currentMonth] });
      setShowDialog(false);
      setForm({ agent_name: '', agent_email: '', sales_amount: '' });
    },
  });

  const updateSale = useMutation({
    mutationFn: async (data) => {
      await base44.entities.AgentSales.update(editingId, {
        sales_amount: parseFloat(data.sales_amount),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-sales', brokerageId, currentMonth] });
      setShowDialog(false);
      setEditingId(null);
      setForm({ agent_name: '', agent_email: '', sales_amount: '' });
    },
  });

  const deleteSale = useMutation({
    mutationFn: (id) => base44.entities.AgentSales.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agent-sales', brokerageId, currentMonth] }),
  });

  const handleSubmit = () => {
    if (!form.agent_name || !form.agent_email || !form.sales_amount) return;
    if (editingId) {
      updateSale.mutate(form);
    } else {
      createSale.mutate(form);
    }
  };

  const openEdit = (sale) => {
    setEditingId(sale.id);
    setForm({ agent_name: sale.agent_name, agent_email: sale.agent_email, sales_amount: sale.sales_amount.toString() });
    setShowDialog(true);
  };

  const openNew = () => {
    setEditingId(null);
    setForm({ agent_name: '', agent_email: '', sales_amount: '' });
    setShowDialog(true);
  };

  const totalSales = rankedSales.reduce((sum, sale) => sum + sale.sales_amount, 0);

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <div className="text-center">
          <Trophy className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground">Admin access required.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-10 max-w-5xl mx-auto">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <Trophy className="w-7 h-7 text-yellow-500" />
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-foreground tracking-tight">Sales Leaderboard</h1>
            <p className="text-muted-foreground text-sm mt-0.5">Top 10 by monthly sales</p>
          </div>
        </div>
        <Button onClick={openNew} className="gap-2 rounded-xl h-11">
          <Plus className="w-4 h-4" /> Add Sale
        </Button>
      </motion.div>

      {/* Month Selector */}
      <div className="mb-6 flex items-center gap-3">
        <Label className="text-sm">Month:</Label>
        <Input
          type="month"
          value={currentMonth}
          onChange={(e) => setCurrentMonth(e.target.value)}
          className="w-40"
        />
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="bg-card rounded-2xl border border-border p-5">
          <p className="text-sm text-muted-foreground">Ranked Members</p>
          <p className="text-3xl font-bold mt-1">{rankedSales.length}</p>
        </div>
        <div className="bg-card rounded-2xl border border-border p-5">
          <p className="text-sm text-muted-foreground">Total Sales</p>
          <p className="text-3xl font-bold mt-1">${(totalSales / 1000000).toFixed(1)}M</p>
        </div>
        <div className="bg-card rounded-2xl border border-border p-5">
          <p className="text-sm text-muted-foreground">Avg Sale</p>
          <p className="text-3xl font-bold mt-1">
            ${rankedSales.length > 0 ? (totalSales / rankedSales.length / 1000000).toFixed(1) : '0'}M
          </p>
        </div>
      </div>

      {/* Leaderboard */}
      <div className="space-y-3">
        {rankedSales.length === 0 ? (
          <div className="text-center py-16">
            <DollarSign className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
            <p className="text-muted-foreground">No sales recorded for this month yet.</p>
          </div>
        ) : (
          rankedSales.map((sale, idx) => (
            <motion.div
              key={sale.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.05 }}
              className="bg-card rounded-2xl border border-border p-5 flex flex-col sm:flex-row sm:items-center gap-4"
            >
              <div className="flex items-center gap-4 flex-1">
                {/* Rank */}
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm flex-shrink-0 ${
                  idx === 0 ? 'bg-yellow-400/20 text-yellow-600' :
                  idx === 1 ? 'bg-gray-300/20 text-gray-600' :
                  idx === 2 ? 'bg-orange-400/20 text-orange-600' :
                  'bg-muted text-muted-foreground'
                }`}>
                  #{idx + 1}
                </div>

                {/* Agent Info */}
                <div className="flex-1">
                  <p className="font-semibold text-foreground">{sale.agent_name}</p>
                  <p className="text-xs text-muted-foreground">{sale.agent_email}</p>
                </div>
              </div>

              {/* Sales Amount */}
              <div className="flex items-center gap-6 flex-shrink-0">
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Sales</p>
                  <p className="text-xl font-bold">${(sale.sales_amount / 1000000).toFixed(1)}M</p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="rounded-xl text-primary hover:text-primary"
                    onClick={() => openEdit(sale)}
                  >
                    <Edit2 className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="rounded-xl text-destructive hover:text-destructive"
                    onClick={() => deleteSale.mutate(sale.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </motion.div>
          ))
        )}
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Sale' : 'Add Sale'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {!editingId && (
              <div>
                <Label>Agent / Broker</Label>
                <select
                  value={form.agent_email}
                  onChange={(e) => {
                    const agent = allUsers.find(u => u.email === e.target.value);
                    setForm({ ...form, agent_email: e.target.value, agent_name: agent?.full_name || '' });
                  }}
                  className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">Select a person...</option>
                  {allUsers.map(u => (
                    <option key={u.id} value={u.email}>{u.full_name} ({u.email})</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <Label>Sales Amount ($)</Label>
              <Input
                type="number"
                value={form.sales_amount}
                onChange={(e) => setForm({ ...form, sales_amount: e.target.value })}
                placeholder="e.g. 500000"
                className="mt-1.5"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button
              onClick={handleSubmit}
              disabled={!form.agent_email || !form.sales_amount || createSale.isPending || updateSale.isPending}
            >
              {editingId ? 'Update' : 'Add Sale'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}