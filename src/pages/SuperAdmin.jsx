import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  Building2, Plus, Users, ShieldCheck, Trash2, ToggleLeft, ToggleRight,
  Upload, Crown, ChevronRight, ArrowLeft, Save, CheckCircle, Settings, UserPlus
} from 'lucide-react';
import { motion } from 'framer-motion';
import { isAdminRole, normalizeRole, can } from '../../shared/permissions.generated.js';

export default function SuperAdmin() {
  const { user } = useOutletContext();
  const queryClient = useQueryClient();
  const isSuperAdmin = true;

  // Top-level state
  const [showCreate, setShowCreate] = useState(false);
  const [selectedBrokerage, setSelectedBrokerage] = useState(null); // drill-in view
  const [form, setForm] = useState({ name: '', broker_name: '', broker_title: '', phone: '', email: '', welcome_message: '', logo_url: '' });
  const [assignOwnerDialog, setAssignOwnerDialog] = useState(null);
  const [inviteDialog, setInviteDialog] = useState(null);
  const [inviteForm, setInviteForm] = useState({ email: '', role: 'user' });
  const [inviting, setInviting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [editingNameId, setEditingNameId] = useState(null);
  const [editingNameValue, setEditingNameValue] = useState('');

  const { data: brokerages = [] } = useQuery({
    queryKey: ['brokerages'],
    queryFn: () => base44.entities.Brokerage.list('-created_date', 100),
    enabled: isSuperAdmin,
  });

  const { data: allUsers = [], refetch: refetchUsers } = useQuery({
    queryKey: ['all-users'],
    queryFn: () => base44.entities.User.list('-created_date', 500),
    enabled: isSuperAdmin,
  });

  const updateUserRole = useMutation({
    mutationFn: ({ id, role }) => base44.entities.User.update(id, { role }),
    onSuccess: () => refetchUsers(),
  });

  const updateUserName = useMutation({
    mutationFn: async ({ id, display_name }) => {
      await base44.entities.User.update(id, { display_name });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-users'] });
      refetchUsers();
    },
  });

  const deleteUser = useMutation({
    mutationFn: (id) => base44.entities.User.delete(id),
    onSuccess: () => refetchUsers(),
  });

  const suspendUser = useMutation({
    mutationFn: ({ id, suspended }) => base44.entities.User.update(id, { suspended }),
    onSuccess: () => refetchUsers(),
  });

  const createBrokerage = useMutation({
    mutationFn: async (data) => {
      const brokerage = await base44.entities.Brokerage.create({ ...data, status: 'active', account_owner_id: user?.id });
      // Auto-assign the creator's brokerage_id so they appear in the same brokerage as their agents
      await base44.auth.updateMe({ brokerage_id: brokerage.id });
      return brokerage;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brokerages'] });
      setShowCreate(false);
      setForm({ name: '', broker_name: '', broker_title: '', phone: '', email: '', welcome_message: '', logo_url: '' });
    },
  });

  const toggleStatus = useMutation({
    mutationFn: ({ id, status }) => base44.entities.Brokerage.update(id, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['brokerages'] }),
  });

  const deleteBrokerage = useMutation({
    mutationFn: (id) => base44.entities.Brokerage.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brokerages'] });
      setSelectedBrokerage(null);
    },
  });

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setForm({ ...form, logo_url: file_url });
    setUploading(false);
  };

  const handleInvite = async () => {
    if (!inviteForm.email || !inviteDialog) return;
    setInviting(true);
    await base44.users.inviteUser(inviteForm.email, inviteForm.role, {
      nextUrl: `/JoinBrokerage?brokerage_id=${inviteDialog.id}`
    });
    setInviting(false);
    setInviteDialog(null);
    setInviteForm({ email: '', role: 'user' });
    refetchUsers();
  };

  if (!isSuperAdmin) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <div className="text-center">
          <ShieldCheck className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground">Admin access required.</p>
        </div>
      </div>
    );
  }

  // If a brokerage is selected, show the drill-in management view
  if (selectedBrokerage) {
    return (
      <BrokerageManagement
        brokerage={selectedBrokerage}
        allUsers={allUsers}
        currentUser={user}
        onBack={() => setSelectedBrokerage(null)}
        onUpdateBrokerage={(updated) => {
          setSelectedBrokerage(updated);
          queryClient.invalidateQueries({ queryKey: ['brokerages'] });
        }}
        onDeleteBrokerage={() => deleteBrokerage.mutate(selectedBrokerage.id)}
        onToggleStatus={() => toggleStatus.mutate({
          id: selectedBrokerage.id,
          status: selectedBrokerage.status === 'active' ? 'suspended' : 'active'
        })}
        updateUserRole={updateUserRole}
        updateUserName={updateUserName}
        deleteUser={deleteUser}
        suspendUser={suspendUser}
        refetchUsers={refetchUsers}
        onInviteUser={(b) => setInviteDialog(b)}
      />
    );
  }

  return (
    <div className="p-6 lg:p-10 max-w-6xl mx-auto">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <Building2 className="w-7 h-7 text-primary" />
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-foreground tracking-tight">Platform Management</h1>
            <p className="text-muted-foreground text-sm mt-0.5">Manage brokerages and users on the platform</p>
          </div>
        </div>
      </motion.div>

      <Tabs defaultValue="brokerages">
        <TabsList className="mb-6">
          <TabsTrigger value="brokerages">Brokerages</TabsTrigger>
          <TabsTrigger value="users">All Users</TabsTrigger>
        </TabsList>

        <TabsContent value="brokerages">
          <div className="flex justify-end mb-4">
            <Button onClick={() => setShowCreate(true)} className="gap-2 rounded-xl h-11">
              <Plus className="w-4 h-4" /> New Brokerage
            </Button>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
            <div className="bg-card rounded-2xl border border-border p-5">
              <p className="text-sm text-muted-foreground">Total Brokerages</p>
              <p className="text-3xl font-bold mt-1">{brokerages.length}</p>
            </div>
            <div className="bg-card rounded-2xl border border-border p-5">
              <p className="text-sm text-muted-foreground">Active</p>
              <p className="text-3xl font-bold mt-1 text-accent">{brokerages.filter(b => b.status === 'active').length}</p>
            </div>
            <div className="bg-card rounded-2xl border border-border p-5">
              <p className="text-sm text-muted-foreground">Suspended</p>
              <p className="text-3xl font-bold mt-1 text-destructive">{brokerages.filter(b => b.status === 'suspended').length}</p>
            </div>
          </div>

          <div className="space-y-3">
            {brokerages.map((b, i) => {
              const brokerageUsers = allUsers.filter(u => u.brokerage_id === b.id);
              const owner = allUsers.find(u => u.id === b.account_owner_id);
              return (
                <motion.div
                  key={b.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="bg-card rounded-2xl border border-border p-5 flex flex-col md:flex-row md:items-center gap-4 hover:border-primary/30 transition-colors cursor-pointer"
                  onClick={() => setSelectedBrokerage(b)}
                >
                  {b.logo_url ? (
                    <img src={b.logo_url} alt="Logo" className="w-12 h-12 rounded-2xl object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <span className="text-lg font-bold text-primary">{b.name?.[0]?.toUpperCase()}</span>
                    </div>
                  )}
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-foreground">{b.name}</p>
                      <Badge variant={b.status === 'active' ? 'default' : 'destructive'} className="text-[10px]">
                        {b.status}
                      </Badge>
                      {owner && (
                        <Badge className="gap-1 bg-primary/20 text-primary border-primary/30 text-xs">
                          <Crown className="w-3 h-3" /> {owner.full_name}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">{b.broker_name}{b.broker_title ? ` · ${b.broker_title}` : ''}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{brokerageUsers.length} user{brokerageUsers.length !== 1 ? 's' : ''}</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                </motion.div>
              );
            })}
            {brokerages.length === 0 && (
              <div className="text-center py-16">
                <Building2 className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
                <p className="text-muted-foreground">No brokerages yet. Create your first one.</p>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="users">
          <div className="space-y-3">
            {allUsers.map((u, i) => {
              const isAccountOwner = brokerages.some(b => b.account_owner_id === u.id);
              const brokerageName = brokerages.find(b => b.id === u.brokerage_id)?.name;
              return (
                <motion.div
                  key={u.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className={`bg-card rounded-2xl border p-4 flex flex-col sm:flex-row sm:items-center gap-3 ${isAccountOwner ? 'border-primary/30 bg-primary/5' : 'border-border'}`}
                >
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-bold text-primary">{u.full_name?.[0]?.toUpperCase() || '?'}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {editingNameId === u.id ? (
                        <div className="flex items-center gap-1.5">
                          <Input
                            value={editingNameValue}
                            onChange={(e) => setEditingNameValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') { updateUserName.mutate({ id: u.id, email: u.email, full_name: editingNameValue }); setEditingNameId(null); }
                              if (e.key === 'Escape') setEditingNameId(null);
                            }}
                            className="h-7 text-sm w-40"
                            autoFocus
                          />
                          <Button size="sm" className="h-7 text-xs px-2" onClick={() => { updateUserName.mutate({ id: u.id, email: u.email, full_name: editingNameValue }); setEditingNameId(null); }}>Save</Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={() => setEditingNameId(null)}>Cancel</Button>
                        </div>
                      ) : (
                        <p
                          className="font-semibold text-sm text-foreground cursor-pointer hover:text-primary transition-colors"
                          title="Click to edit name"
                          onClick={() => { setEditingNameId(u.id); setEditingNameValue(u.display_name || u.full_name || ''); }}
                        >
                          {u.full_name}
                        </p>
                      )}
                      {isAccountOwner && (
                        <Badge className="gap-1 bg-primary/20 text-primary border-primary/30 text-xs">
                          <Crown className="w-3 h-3" /> Account Owner
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{u.email}</p>
                    {brokerageName && <p className="text-xs text-muted-foreground mt-0.5">🏢 {brokerageName}</p>}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Badge variant={isAdminRole(u.role) ? 'default' : 'secondary'} className="text-xs capitalize">
                      {isAdminRole(u.role) ? 'Broker/Admin' : normalizeRole(u.role) === 'agent' ? 'Agent' : u.role || 'unknown'}
                    </Badge>
                    <select
                      value={u.role || 'user'}
                      onChange={(e) => updateUserRole.mutate({ id: u.id, role: e.target.value })}
                      className="rounded-lg border border-input bg-background px-2 py-1.5 text-xs"
                    >
                      <option value="user">Agent</option>
                      <option value="admin">Broker / Admin</option>
                    </select>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="rounded-xl text-destructive hover:text-destructive"
                      onClick={() => deleteUser.mutate(u.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </motion.div>
              );
            })}
            {allUsers.length === 0 && (
              <div className="text-center py-16">
                <Users className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
                <p className="text-muted-foreground">No users found.</p>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Create Brokerage Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create New Brokerage</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>Brokerage Name *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Apex Realty Group" className="mt-1.5" />
              </div>
              <div>
                <Label>Broker Name *</Label>
                <Input value={form.broker_name} onChange={(e) => setForm({ ...form, broker_name: e.target.value })} placeholder="e.g. John Smith" className="mt-1.5" />
              </div>
              <div>
                <Label>Broker Title</Label>
                <Input value={form.broker_title} onChange={(e) => setForm({ ...form, broker_title: e.target.value })} placeholder="e.g. Managing Broker" className="mt-1.5" />
              </div>
              <div>
                <Label>Phone</Label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="(555) 123-4567" className="mt-1.5" />
              </div>
              <div>
                <Label>Email</Label>
                <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="support@brokerage.com" className="mt-1.5" />
              </div>
              <div className="col-span-2">
                <Label>Welcome Message for Agents</Label>
                <Input value={form.welcome_message} onChange={(e) => setForm({ ...form, welcome_message: e.target.value })} placeholder="Welcome! I'm here to help..." className="mt-1.5" />
              </div>
              <div className="col-span-2">
                <Label>Company Logo</Label>
                <div className="mt-1.5 flex items-center gap-3">
                  {form.logo_url && <img src={form.logo_url} alt="Logo preview" className="w-12 h-12 rounded-lg object-cover" />}
                  <label className="flex-1 relative">
                    <input type="file" accept="image/*" onChange={handleLogoUpload} disabled={uploading} className="hidden" />
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full gap-2 rounded-xl"
                      disabled={uploading}
                      onClick={(e) => e.currentTarget.parentElement.querySelector('input').click()}
                    >
                      <Upload className="w-4 h-4" />
                      {uploading ? 'Uploading...' : form.logo_url ? 'Change Logo' : 'Upload Logo'}
                    </Button>
                  </label>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button
              onClick={() => createBrokerage.mutate(form)}
              disabled={!form.name || !form.broker_name || createBrokerage.isPending}
            >
              {createBrokerage.isPending ? 'Creating...' : 'Create Brokerage'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invite User Dialog */}
      <Dialog open={!!inviteDialog} onOpenChange={() => setInviteDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Invite User to {inviteDialog?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Email Address</Label>
              <Input value={inviteForm.email} onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })} placeholder="agent@email.com" className="mt-1.5" />
            </div>
            <div>
              <Label>Role</Label>
              <select
                value={inviteForm.role}
                onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value })}
                className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="user">Agent</option>
                <option value="admin">Broker / Admin</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteDialog(null)}>Cancel</Button>
            <Button onClick={handleInvite} disabled={!inviteForm.email || inviting}>
              {inviting ? 'Inviting...' : 'Send Invite'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Brokerage Management Drill-In View ───────────────────────────────────────

function BrokerageManagement({ brokerage, allUsers, currentUser, onBack, onUpdateBrokerage, onDeleteBrokerage, onToggleStatus, updateUserRole, updateUserName, deleteUser, suspendUser, refetchUsers, onInviteUser }) {
  const queryClient = useQueryClient();
  const brokerageUsers = allUsers.filter(u => u.brokerage_id === brokerage.id);
  const owner = allUsers.find(u => u.id === brokerage.account_owner_id);
  const [editingNameId, setEditingNameId] = useState(null);
  const [editingNameValue, setEditingNameValue] = useState('');
  const [enteringPlatform, setEnteringPlatform] = useState(false);

  // Settings state
  const [settingsId, setSettingsId] = useState(null);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [settingsForm, setSettingsForm] = useState({
    brokerage_name: brokerage.name || '',
    broker_name: brokerage.broker_name || '',
    broker_title: brokerage.broker_title || '',
    brokerage_phone: brokerage.phone || '',
    brokerage_email: brokerage.email || '',
    welcome_message: brokerage.welcome_message || '',
    openai_api_key: '',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Invite state
  const [showInvite, setShowInvite] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: '', role: 'user' });
  const [inviting, setInviting] = useState(false);

  // Force-add state
  const [showForceAdd, setShowForceAdd] = useState(false);
  const [forceForm, setForceForm] = useState({ full_name: '', email: '', role: 'user' });
  const [forceAdding, setForceAdding] = useState(false);
  const [forceError, setForceError] = useState('');
  const [forceSuccess, setForceSuccess] = useState('');

  React.useEffect(() => {
    base44.entities.BrokerageSettings.filter({ brokerage_id: brokerage.id }).then((results) => {
      if (results.length > 0) {
        const s = results[0];
        setSettingsId(s.id);
        setSettingsForm({
          brokerage_name: s.brokerage_name || brokerage.name || '',
          broker_name: s.broker_name || brokerage.broker_name || '',
          broker_title: s.broker_title || brokerage.broker_title || '',
          brokerage_phone: s.brokerage_phone || brokerage.phone || '',
          brokerage_email: s.brokerage_email || brokerage.email || '',
          welcome_message: s.welcome_message || '',
          openai_api_key: s.openai_api_key || '',
        });
      }
      setSettingsLoaded(true);
    });
  }, [brokerage.id]);

  const handleSaveSettings = async () => {
    setSaving(true);
    if (settingsId) {
      await base44.entities.BrokerageSettings.update(settingsId, { ...settingsForm, brokerage_id: brokerage.id });
    } else {
      const created = await base44.entities.BrokerageSettings.create({ ...settingsForm, brokerage_id: brokerage.id });
      setSettingsId(created.id);
    }
    // Also update the Brokerage entity itself
    await base44.entities.Brokerage.update(brokerage.id, {
      name: settingsForm.brokerage_name,
      broker_name: settingsForm.broker_name,
      broker_title: settingsForm.broker_title,
      phone: settingsForm.brokerage_phone,
      email: settingsForm.brokerage_email,
      welcome_message: settingsForm.welcome_message,
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
    onUpdateBrokerage({ ...brokerage, name: settingsForm.brokerage_name, broker_name: settingsForm.broker_name });
  };

  const handleInvite = async () => {
    if (!inviteForm.email) return;
    setInviting(true);
    await base44.users.inviteUser(inviteForm.email, inviteForm.role, {
      nextUrl: `/JoinBrokerage?brokerage_id=${brokerage.id}`
    });
    setInviting(false);
    setShowInvite(false);
    setInviteForm({ email: '', role: 'user' });
    refetchUsers();
  };

  const handleForceAdd = async () => {
    if (!forceForm.email || !forceForm.full_name) return;
    setForceAdding(true);
    setForceError('');
    setForceSuccess('');
    try {
      const response = await base44.functions.invoke('forceCreateUser', {
        email: forceForm.email,
        full_name: forceForm.full_name,
        role: forceForm.role,
        brokerage_id: brokerage.id,
      });
      setForceSuccess(`✅ ${response.data.message}`);
      setForceForm({ full_name: '', email: '', role: 'user' });
      refetchUsers();
    } catch (err) {
      setForceError(err?.message || 'Failed to create user. Email may already exist.');
    }
    setForceAdding(false);
  };

  const handleAssignOwner = async (userId) => {
    await base44.entities.Brokerage.update(brokerage.id, { account_owner_id: userId });
    queryClient.invalidateQueries({ queryKey: ['brokerages'] });
    onUpdateBrokerage({ ...brokerage, account_owner_id: userId });
  };

  const handleEnterPlatform = async () => {
    setEnteringPlatform(true);
    try {
      await base44.auth.updateMe({ brokerage_id: brokerage.id });
      setTimeout(() => window.location.href = '/Dashboard', 500);
    } catch (err) {
      setEnteringPlatform(false);
    }
  };

  return (
    <div className="p-6 lg:p-10 max-w-6xl mx-auto">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to all brokerages
        </button>
        <div className="flex flex-col md:flex-row md:items-center gap-4 justify-between">
          <div className="flex items-center gap-4">
            {brokerage.logo_url ? (
              <img src={brokerage.logo_url} alt="Logo" className="w-14 h-14 rounded-2xl object-cover flex-shrink-0" />
            ) : (
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                <span className="text-2xl font-bold text-primary">{brokerage.name?.[0]?.toUpperCase()}</span>
              </div>
            )}
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-bold text-foreground">{brokerage.name}</h1>
                <Badge variant={brokerage.status === 'active' ? 'default' : 'destructive'} className="text-xs">
                  {brokerage.status}
                </Badge>
                {owner && (
                  <Badge className="gap-1 bg-primary/20 text-primary border-primary/30 text-xs">
                    <Crown className="w-3 h-3" /> {owner.full_name}
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">{brokerage.broker_name}{brokerage.broker_title ? ` · ${brokerage.broker_title}` : ''}</p>
              <p className="text-xs font-mono text-muted-foreground/60 mt-0.5">ID: {brokerage.id}</p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button
              size="sm"
              className="gap-1.5 rounded-xl text-xs"
              onClick={handleEnterPlatform}
              disabled={enteringPlatform}
            >
              {enteringPlatform ? 'Entering...' : 'Enter Platform'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 rounded-xl text-xs"
              onClick={onToggleStatus}
            >
              {brokerage.status === 'active'
                ? <><ToggleRight className="w-4 h-4 text-accent" /> Suspend</>
                : <><ToggleLeft className="w-4 h-4 text-muted-foreground" /> Activate</>}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 rounded-xl text-xs text-destructive hover:text-destructive"
              onClick={onDeleteBrokerage}
            >
              <Trash2 className="w-4 h-4" /> Delete
            </Button>
          </div>
        </div>
      </motion.div>

      <Tabs defaultValue="users">
        <TabsList className="mb-6">
          <TabsTrigger value="users">
            <Users className="w-4 h-4 mr-1.5" /> Users ({brokerageUsers.length})
          </TabsTrigger>
          <TabsTrigger value="settings">
            <Settings className="w-4 h-4 mr-1.5" /> Settings
          </TabsTrigger>
        </TabsList>

        {/* USERS TAB */}
        <TabsContent value="users">
          <div className="flex justify-between items-center mb-4">
            <p className="text-sm text-muted-foreground">{brokerageUsers.length} member{brokerageUsers.length !== 1 ? 's' : ''} in this brokerage</p>
            <div className="flex gap-2">
              <Button onClick={() => setShowForceAdd(true)} variant="outline" className="gap-2 rounded-xl h-9 text-sm">
                <Plus className="w-4 h-4" /> Force Add User
              </Button>
              <Button onClick={() => setShowInvite(true)} className="gap-2 rounded-xl h-9 text-sm">
                <UserPlus className="w-4 h-4" /> Invite User
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            {brokerageUsers.map((u, i) => {
              const isOwner = brokerage.account_owner_id === u.id;
              return (
                <motion.div
                  key={u.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className={`bg-card rounded-2xl border p-4 flex flex-col sm:flex-row sm:items-center gap-3 ${isOwner ? 'border-primary/30 bg-primary/5' : 'border-border'}`}
                >
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 overflow-hidden">
                    {u.headshot ? (
                      <img src={u.headshot} alt={u.full_name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-sm font-bold text-primary">{u.full_name?.[0]?.toUpperCase() || '?'}</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {editingNameId === u.id ? (
                        <div className="flex items-center gap-1.5">
                          <Input
                            value={editingNameValue}
                            onChange={(e) => setEditingNameValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') { updateUserName.mutate({ id: u.id, display_name: editingNameValue }); setEditingNameId(null); }
                              if (e.key === 'Escape') setEditingNameId(null);
                            }}
                            className="h-7 text-sm w-40"
                            autoFocus
                          />
                          <Button size="sm" className="h-7 text-xs px-2" onClick={() => { updateUserName.mutate({ id: u.id, display_name: editingNameValue }); setEditingNameId(null); }}>Save</Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={() => setEditingNameId(null)}>Cancel</Button>
                          </div>
                          ) : (
                          <p
                          className="font-semibold text-sm text-foreground cursor-pointer hover:text-primary transition-colors"
                          title="Click to edit name"
                          onClick={() => { setEditingNameId(u.id); setEditingNameValue(u.display_name || u.full_name || ''); }}
                          >
                          {u.display_name || u.full_name}
                          </p>
                          )}
                          {isOwner && (
                        <Badge className="gap-1 bg-primary/20 text-primary border-primary/30 text-xs">
                          <Crown className="w-3 h-3" /> Account Owner
                        </Badge>
                      )}
                      {u.agent_status && (
                        <Badge className={`text-xs capitalize ${
                          u.agent_status === 'available' ? 'bg-green-500 text-white' :
                          u.agent_status === 'busy' ? 'bg-yellow-500 text-white' : 'bg-muted text-muted-foreground'
                        }`}>
                          {u.agent_status}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{u.email}</p>
                    {u.title && <p className="text-xs text-muted-foreground">{u.title}</p>}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                    <select
                      value={u.role || 'user'}
                      onChange={(e) => updateUserRole.mutate({ id: u.id, role: e.target.value })}
                      className="rounded-lg border border-input bg-background px-2 py-1.5 text-xs"
                    >
                      <option value="user">Agent</option>
                      <option value="admin">Broker / Admin</option>
                    </select>
                    {!isOwner && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1 rounded-xl text-xs"
                        title="Make account owner"
                        onClick={() => handleAssignOwner(u.id)}
                      >
                        <Crown className="w-3 h-3" /> Set Owner
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1 rounded-xl text-xs"
                      onClick={() => suspendUser.mutate({ id: u.id, suspended: !u.suspended })}
                    >
                      {u.suspended ? <><ToggleLeft className="w-4 h-4" /> Reactivate</> : <><ToggleRight className="w-4 h-4 text-accent" /> Active</>}
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
                </motion.div>
              );
            })}
            {brokerageUsers.length === 0 && (
              <div className="text-center py-16">
                <Users className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
                <p className="text-muted-foreground">No users in this brokerage yet.</p>
                <div className="flex gap-2 justify-center mt-4">
                  <Button onClick={() => setShowForceAdd(true)} variant="outline" className="gap-2 rounded-xl">
                    <Plus className="w-4 h-4" /> Force Add User
                  </Button>
                  <Button onClick={() => setShowInvite(true)} variant="outline" className="gap-2 rounded-xl">
                    <UserPlus className="w-4 h-4" /> Invite User
                  </Button>
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        {/* SETTINGS TAB */}
        <TabsContent value="settings">
          {settingsLoaded && (
            <div className="bg-card rounded-2xl border border-border p-6 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <Label>Brokerage Name *</Label>
                  <Input value={settingsForm.brokerage_name} onChange={(e) => setSettingsForm({ ...settingsForm, brokerage_name: e.target.value })} placeholder="e.g. Apex Realty Group" className="mt-1.5" />
                </div>
                <div>
                  <Label>Broker Name *</Label>
                  <Input value={settingsForm.broker_name} onChange={(e) => setSettingsForm({ ...settingsForm, broker_name: e.target.value })} placeholder="e.g. John Smith" className="mt-1.5" />
                </div>
                <div>
                  <Label>Broker Title</Label>
                  <Input value={settingsForm.broker_title} onChange={(e) => setSettingsForm({ ...settingsForm, broker_title: e.target.value })} placeholder="e.g. Managing Broker" className="mt-1.5" />
                </div>
                <div>
                  <Label>Brokerage Phone</Label>
                  <Input value={settingsForm.brokerage_phone} onChange={(e) => setSettingsForm({ ...settingsForm, brokerage_phone: e.target.value })} placeholder="(555) 123-4567" className="mt-1.5" />
                </div>
                <div className="sm:col-span-2">
                  <Label>Brokerage Email</Label>
                  <Input value={settingsForm.brokerage_email} onChange={(e) => setSettingsForm({ ...settingsForm, brokerage_email: e.target.value })} placeholder="support@brokerage.com" className="mt-1.5" />
                </div>
                <div className="sm:col-span-2">
                  <Label>Welcome Message for Agents</Label>
                  <Textarea value={settingsForm.welcome_message} onChange={(e) => setSettingsForm({ ...settingsForm, welcome_message: e.target.value })} placeholder="Welcome! I'm here to help..." className="mt-1.5" />
                </div>
              </div>
              <div className="flex justify-end pt-2">
                <Button onClick={handleSaveSettings} disabled={saving || !settingsForm.brokerage_name || !settingsForm.broker_name} className="gap-2 rounded-xl h-11 min-w-[140px]">
                  {saved ? <><CheckCircle className="w-4 h-4" /> Saved!</> : saving ? 'Saving...' : <><Save className="w-4 h-4" /> Save Settings</>}
                </Button>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Force Add User Dialog */}
      <Dialog open={showForceAdd} onOpenChange={(open) => { setShowForceAdd(open); setForceError(''); setForceSuccess(''); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Force Add User to {brokerage.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-sm text-blue-800">
              👤 Creates the user profile and sends them an invite email to set their password and log in.
            </div>
            {forceSuccess && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-sm text-green-800">
                ✅ {forceSuccess}
              </div>
            )}
            {forceError && (
              <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-3 text-sm text-destructive">
                {forceError}
              </div>
            )}
            <div>
              <Label>Full Name</Label>
              <Input value={forceForm.full_name} onChange={(e) => setForceForm({ ...forceForm, full_name: e.target.value })} placeholder="e.g. Jane Smith" className="mt-1.5" />
            </div>
            <div>
              <Label>Email Address</Label>
              <Input value={forceForm.email} onChange={(e) => setForceForm({ ...forceForm, email: e.target.value })} placeholder="agent@email.com" className="mt-1.5" />
            </div>
            <div>
              <Label>Role</Label>
              <select
                value={forceForm.role}
                onChange={(e) => setForceForm({ ...forceForm, role: e.target.value })}
                className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="user">Agent</option>
                <option value="admin">Broker / Admin</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowForceAdd(false); setForceError(''); setForceSuccess(''); }}>Close</Button>
            {!forceSuccess && (
              <Button onClick={handleForceAdd} disabled={!forceForm.email || !forceForm.full_name || forceAdding}>
                {forceAdding ? 'Sending...' : 'Send Invite'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invite Dialog */}
      <Dialog open={showInvite} onOpenChange={setShowInvite}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Invite User to {brokerage.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="bg-muted rounded-xl p-3 text-sm text-muted-foreground">
              <p className="font-medium text-foreground mb-1">Brokerage ID:</p>
              <p className="font-mono text-xs break-all">{brokerage.id}</p>
              <p className="text-xs mt-1">User will be auto-joined to this brokerage via invite link.</p>
            </div>
            <div>
              <Label>Email Address</Label>
              <Input value={inviteForm.email} onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })} placeholder="agent@email.com" className="mt-1.5" />
            </div>
            <div>
              <Label>Role</Label>
              <select
                value={inviteForm.role}
                onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value })}
                className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="user">Agent</option>
                <option value="admin">Broker / Admin</option>
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
    </div>
  );
}