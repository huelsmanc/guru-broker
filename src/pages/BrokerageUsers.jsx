import React, { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Users, Trash2, ToggleLeft, ToggleRight, Plus, ShieldCheck, Crown, Briefcase, Pencil } from 'lucide-react';
import { motion } from 'framer-motion';
import OnboardingChecklist from '@/components/onboarding/OnboardingChecklist';
import UserAdminDialog from '@/components/users/UserAdminDialog';
import { isAdminRole, normalizeRole, can } from '../../shared/permissions.generated.js';

export default function BrokerageUsers() {
  const { user, brokerageId } = useOutletContext();
  const queryClient = useQueryClient();
  const isAdmin = isAdminRole(user?.role);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: '', full_name: '', role: 'user' });
  const [inviting, setInviting] = useState(false);
  const [selectedOnboarding, setSelectedOnboarding] = useState(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [showEditUser, setShowEditUser] = useState(false);

  // Get brokerage to find account owner
  const { data: brokerage } = useQuery({
    queryKey: ['brokerage', brokerageId],
    queryFn: async () => {
      const result = await base44.entities.Brokerage.filter({ id: brokerageId });
      return result[0];
    },
    enabled: !!brokerageId && isAdmin,
  });

  // Get all users and filter by brokerage
  const { data: allUsers = [] } = useQuery({
    queryKey: ['brokerage-users', brokerageId],
    queryFn: async () => {
      const all = await base44.entities.User.list('-created_date', 500);
      return all.filter(u => u.brokerage_id === brokerageId);
    },
    enabled: !!brokerageId && isAdmin,
    staleTime: 0,
  });

  // Get onboarding records
  const { data: onboardings = [] } = useQuery({
    queryKey: ['onboarding', brokerageId],
    queryFn: () => base44.entities.Onboarding.filter({ brokerage_id: brokerageId }, '-created_date', 200),
    enabled: !!brokerageId && isAdmin,
  });

  const deleteUser = useMutation({
    mutationFn: (id) => base44.entities.User.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['brokerage-users', brokerageId] }),
  });

  const suspendUser = useMutation({
    mutationFn: ({ id, suspended }) => base44.entities.User.update(id, { suspended }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['brokerage-users', brokerageId] }),
  });

  // Team duties (separate from admin/agent permissions): who gets TC work and compliance alerts.
  const setDuty = useMutation({
    mutationFn: ({ u, duty, on }) => {
      const duties = new Set(u.duties || []);
      if (on) duties.add(duty); else duties.delete(duty);
      return base44.entities.User.update(u.id, { duties: [...duties] });
    },
    onSuccess: () => queryClient.invalidateQueries(),
  });

  const openOnboarding = useMutation({
    mutationFn: async (agentUser) => {
      let onboarding = onboardings.find(o => o.agent_email === agentUser.email);
      if (!onboarding) {
        onboarding = await base44.entities.Onboarding.create({
          brokerage_id: brokerageId,
          agent_email: agentUser.email,
          agent_name: agentUser.display_name || agentUser.full_name || agentUser.email.split('@')[0],
        });
        await queryClient.invalidateQueries({ queryKey: ['onboarding', brokerageId] });
      }
      return onboarding;
    },
    onSuccess: (onboarding) => {
      setSelectedOnboarding(onboarding);
      setShowOnboarding(true);
    },
  });

  // Subscribe to user updates to keep display names fresh
  React.useEffect(() => {
    const unsubscribe = base44.entities.User.subscribe(() => {
      queryClient.refetchQueries({ queryKey: ['brokerage-users', brokerageId] });
    });
    return unsubscribe;
  }, [brokerageId, queryClient]);

  const getStatusBadgeColor = (status) => {
    if (status === 'available') return 'bg-green-500 text-white';
    if (status === 'busy') return 'bg-yellow-500 text-white';
    return 'bg-muted text-muted-foreground';
  };

  const handleInvite = async () => {
    if (!inviteForm.email) return;
    setInviting(true);
    await base44.users.inviteUser(inviteForm.email, inviteForm.role);

    // If a name was provided, save it as display_name after a short delay (invite creates the user record)
    if (inviteForm.full_name.trim()) {
      setTimeout(async () => {
        const users = await base44.entities.User.filter({ email: inviteForm.email });
        if (users[0]?.id) {
          await base44.entities.User.update(users[0].id, { display_name: inviteForm.full_name.trim() });
          queryClient.invalidateQueries({ queryKey: ['brokerage-users', brokerageId] });
        }
      }, 2000);
    }
    
    // Auto-create onboarding for agents only
    if (inviteForm.role === 'user') {
      await base44.entities.Onboarding.create({
        brokerage_id: brokerageId,
        agent_email: inviteForm.email,
        agent_name: inviteForm.full_name || inviteForm.email.split('@')[0],
      });
    }
    
    setInviting(false);
    setShowInvite(false);
    setInviteForm({ email: '', full_name: '', role: 'user' });
    queryClient.invalidateQueries({ queryKey: ['brokerage-users', brokerageId] });
    queryClient.invalidateQueries({ queryKey: ['onboarding', brokerageId] });
  };

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-[80dvh]">
        <div className="text-center">
          <ShieldCheck className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground">Admin access required.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-10 max-w-6xl mx-auto">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <Users className="w-7 h-7 text-primary" />
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-foreground tracking-tight">Manage Users</h1>
            <p className="text-muted-foreground text-sm mt-0.5">Add and manage agents and admins in your brokerage</p>
          </div>
        </div>
        <Button onClick={() => setShowInvite(true)} className="gap-2 rounded-xl h-11">
          <Plus className="w-4 h-4" /> Invite User
        </Button>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        <div className="bg-card rounded-2xl border border-border p-5">
          <p className="text-sm text-muted-foreground">Total Users</p>
          <p className="text-3xl font-bold mt-1">{allUsers.length}</p>
        </div>
        <div className="bg-card rounded-2xl border border-border p-5">
          <p className="text-sm text-muted-foreground">Admins</p>
          <p className="text-3xl font-bold mt-1 text-primary">{allUsers.filter(u => isAdminRole(u.role)).length}</p>
        </div>
        <div className="bg-card rounded-2xl border border-border p-5">
          <p className="text-sm text-muted-foreground">Agents</p>
          <p className="text-3xl font-bold mt-1 text-accent">{allUsers.filter(u => normalizeRole(u.role) === 'agent').length}</p>
        </div>
      </div>

      {/* Users List */}
      <div className="space-y-3">
        {allUsers.map((u, i) => {
          const isAccountOwner = brokerage?.account_owner_id === u.id;
          const canDelete = !isAccountOwner;

          return (
            <motion.div
              key={u.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className={`bg-card rounded-2xl border p-4 flex flex-col sm:flex-row sm:items-center gap-3 ${
                isAccountOwner ? 'border-primary/30 bg-primary/5' : 'border-border'
              }`}
            >
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 overflow-hidden">
                {u.headshot ? (
                  <img src={u.headshot} alt={u.display_name || u.full_name} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-sm font-bold text-primary">{(u.display_name || u.full_name)?.[0]?.toUpperCase() || '?'}</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-sm text-foreground">{u.display_name || u.full_name}</p>
                  {isAccountOwner && (
                    <Badge className="gap-1 bg-primary/20 text-primary border-primary/30 text-xs">
                      <Crown className="w-3 h-3" /> Account Owner
                    </Badge>
                  )}
                  {normalizeRole(u.role) === 'agent' && u.agent_status && (
                    <Badge className={`text-xs capitalize ${getStatusBadgeColor(u.agent_status)}`}>
                      {u.agent_status}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{u.email}</p>
                {isAdmin && (
                  <div className="flex gap-1.5 mt-1.5">
                    {[['tc', 'Transaction coordinator'], ['compliance', 'Compliance']].map(([duty, label]) => {
                      const on = (u.duties || []).includes(duty);
                      return (
                        <button
                          key={duty}
                          onClick={() => setDuty.mutate({ u, duty, on: !on })}
                          className={`text-[11px] rounded-full px-2 py-0.5 border ${on ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-foreground/40'}`}
                          title={on ? `Remove ${label}` : `Make ${label}`}
                        >
                          {on ? '✓ ' : '+ '}{label}
                        </button>
                      );
                    })}
                  </div>
                )}
                {!isAdmin && (u.duties || []).length > 0 && (
                  <p className="text-[11px] text-muted-foreground mt-1">{(u.duties || []).map((d) => (d === 'tc' ? 'TC' : 'Compliance')).join(' · ')}</p>
                )}
              </div>
              {!isAccountOwner && (
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Badge variant={isAdminRole(u.role) ? 'default' : 'secondary'} className="text-xs capitalize">
                    {isAdminRole(u.role) ? 'Admin' : 'Agent'}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 rounded-xl text-xs text-primary hover:text-primary hover:bg-primary/10"
                    onClick={() => {
                      setEditingUser(u);
                      setShowEditUser(true);
                    }}
                  >
                    <Pencil className="w-4 h-4" /> Edit
                  </Button>
                  {normalizeRole(u.role) === 'agent' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1.5 rounded-xl text-xs text-primary hover:text-primary hover:bg-primary/10"
                      onClick={() => openOnboarding.mutate(u)}
                      disabled={openOnboarding.isPending}
                    >
                      <Briefcase className="w-4 h-4" /> Onboarding
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 rounded-xl text-xs"
                    onClick={() => suspendUser.mutate({ id: u.id, suspended: !u.suspended })}
                  >
                    {u.suspended ? (
                      <><ToggleLeft className="w-4 h-4 text-muted-foreground" /> Reactivate</>
                    ) : (
                      <><ToggleRight className="w-4 h-4 text-accent" /> Active</>
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="rounded-xl text-destructive hover:text-destructive"
                    onClick={() => deleteUser.mutate(u.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              )}
              {isAccountOwner && (
                <Badge variant="outline" className="text-xs">
                  Managed by Platform
                </Badge>
              )}
            </motion.div>
          );
        })}
        {allUsers.length === 0 && (
          <div className="text-center py-16">
            <Users className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
            <p className="text-muted-foreground">No users in your brokerage yet. Invite someone to get started.</p>
          </div>
        )}
      </div>

      {/* Invite Dialog */}
      <Dialog open={showInvite} onOpenChange={setShowInvite}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Invite User to Your Brokerage</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Full Name</Label>
              <Input
                value={inviteForm.full_name}
                onChange={(e) => setInviteForm({ ...inviteForm, full_name: e.target.value })}
                placeholder="Jane Smith"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label>Email Address</Label>
              <Input
                value={inviteForm.email}
                onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                placeholder="agent@email.com"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label>Role</Label>
              <select
                value={inviteForm.role}
                onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value })}
                className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="user">Agent</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInvite(false)}>Cancel</Button>
            <Button onClick={handleInvite} disabled={!inviteForm.email || inviting}>
              {inviting ? 'Inviting...' : 'Send Invite'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Onboarding Checklist Modal */}
      <OnboardingChecklist
        open={showOnboarding}
        onClose={() => setShowOnboarding(false)}
        onboarding={selectedOnboarding}
        brokerageId={brokerageId}
      />

      {/* Edit User Profile Modal */}
      {showEditUser && editingUser && (
        <UserAdminDialog
          person={editingUser}
          me={user}
          onClose={() => { setShowEditUser(false); setEditingUser(null); queryClient.invalidateQueries({ queryKey: ['brokerage-users', brokerageId] }); }}
        />
      )}
    </div>
  );
}