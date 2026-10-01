import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Settings as SettingsIcon, Save, CheckCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import NotificationSettings from '@/components/NotificationSettings';
import TechLinksTab from '@/components/settings/TechLinksTab';
import { isAdminRole, normalizeRole, can } from '../../shared/permissions.generated.js';

export default function Settings() {
  const { user, brokerageId } = useOutletContext();
  const isAdmin = isAdminRole(user?.role);
  const [form, setForm] = useState({
    brokerage_name: '',
    broker_name: '',
    broker_title: '',
    brokerage_phone: '',
    brokerage_email: '',
    welcome_message: '',
    default_tc_email: '',
    default_tc_name: '',
    ceo_name: '',
    ceo_title: '',
    ceo_email: '',
    ceo_signature_url: '',
    logo_url: '',
    thank_you_subject: '',
    thank_you_message: '',
    thank_you_video_url: '',
    cda_direct_agent_pay: false,
    tech_links: [],
    primary_color: '#667eea',
    sidebar_color: '#1c231f',
  });
  const [settingsId, setSettingsId] = useState(null);
  const [brokerageUsers, setBrokerageUsers] = useState([]);
  useEffect(() => {
    if (brokerageId) base44.entities.User.filter({ brokerage_id: brokerageId }, 'full_name', 500).then(setBrokerageUsers).catch(() => {});
  }, [brokerageId]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    base44.entities.BrokerageSettings.filter({ brokerage_id: brokerageId }).then((results) => {
      if (results.length > 0) {
        const s = results[0];
        setSettingsId(s.id);
        setForm({
          brokerage_name: s.brokerage_name || '',
          broker_name: s.broker_name || '',
          broker_title: s.broker_title || '',
          brokerage_phone: s.brokerage_phone || '',
          brokerage_email: s.brokerage_email || '',
          welcome_message: s.welcome_message || '',
          default_tc_email: s.default_tc_email || '',
          default_tc_name: s.default_tc_name || '',
          ceo_name: s.ceo_name || '',
          ceo_title: s.ceo_title || '',
          ceo_email: s.ceo_email || '',
          ceo_signature_url: s.ceo_signature_url || '',
          logo_url: s.logo_url || '',
          thank_you_subject: s.thank_you_subject || '',
          thank_you_message: s.thank_you_message || '',
          thank_you_video_url: s.thank_you_video_url || '',
          cda_direct_agent_pay: s.cda_direct_agent_pay === true,
          tech_links: s.tech_links || [],
          primary_color: s.primary_color || '#667eea',
          sidebar_color: s.sidebar_color || '#1c231f',
        });
      }
    });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    if (settingsId) {
      await base44.entities.BrokerageSettings.update(settingsId, form);
    } else {
      const created = await base44.entities.BrokerageSettings.create({ ...form, brokerage_id: brokerageId });
      setSettingsId(created.id);
    }
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <p className="text-muted-foreground">Only admins can access settings.</p>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-10 max-w-2xl mx-auto">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <SettingsIcon className="w-7 h-7 text-primary" />
          <h1 className="text-2xl lg:text-3xl font-bold text-foreground tracking-tight">Settings</h1>
        </div>
        <p className="text-muted-foreground ml-10">Manage your preferences and brokerage configuration.</p>
      </motion.div>

      <Tabs defaultValue={isAdmin ? "brokerage" : "notifications"} className="space-y-6">
        <TabsList className="w-full">
            {isAdmin && <TabsTrigger value="brokerage">Brokerage Settings</TabsTrigger>}
            {isAdmin && <TabsTrigger value="colors">Brand Colors</TabsTrigger>}
            {isAdmin && <TabsTrigger value="tech_links">Tech Links</TabsTrigger>}
            <TabsTrigger value="notifications">Notifications</TabsTrigger>
          </TabsList>

        {isAdmin && (
          <TabsContent value="brokerage">
            <div className="bg-card rounded-2xl border border-border p-6 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <Label>Brokerage Name *</Label>
            <Input
              value={form.brokerage_name}
              onChange={(e) => setForm({ ...form, brokerage_name: e.target.value })}
              placeholder="e.g. Apex Realty Group"
              className="mt-1.5"
            />
          </div>
          <div>
            <Label>Broker Name *</Label>
            <Input
              value={form.broker_name}
              onChange={(e) => setForm({ ...form, broker_name: e.target.value })}
              placeholder="e.g. John Smith"
              className="mt-1.5"
            />
          </div>
          <div>
            <Label>Broker Title</Label>
            <Input
              value={form.broker_title}
              onChange={(e) => setForm({ ...form, broker_title: e.target.value })}
              placeholder="e.g. Managing Broker"
              className="mt-1.5"
            />
          </div>
          <div>
            <Label>Brokerage Phone</Label>
            <Input
              value={form.brokerage_phone}
              onChange={(e) => setForm({ ...form, brokerage_phone: e.target.value })}
              placeholder="e.g. (555) 123-4567"
              className="mt-1.5"
            />
          </div>
          <div className="sm:col-span-2">
            <Label>Brokerage Email</Label>
            <Input
              value={form.brokerage_email}
              onChange={(e) => setForm({ ...form, brokerage_email: e.target.value })}
              placeholder="e.g. support@apexrealty.com"
              className="mt-1.5"
            />
          </div>
          <div className="sm:col-span-2">
            <Label>Welcome Message for Agents</Label>
            <Textarea
              value={form.welcome_message}
              onChange={(e) => setForm({ ...form, welcome_message: e.target.value })}
              placeholder="e.g. Welcome! I'm here to help you with anything you need."
              className="mt-1.5"
            />
          </div>
          <div className="sm:col-span-2">
            <Label>Default transaction coordinator <span className="text-muted-foreground font-normal">(optional; leave on automatic to rotate among people with the TC role in Manage Users)</span></Label>
            <select
              value={form.default_tc_email}
              onChange={(e) => {
                const u = brokerageUsers.find((x) => x.email === e.target.value);
                setForm({ ...form, default_tc_email: e.target.value, default_tc_name: u?.display_name || u?.full_name || '' });
              }}
              className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">Automatic: TC with the fewest open files</option>
              {brokerageUsers.map((u) => (
                <option key={u.id} value={u.email}>{u.display_name || u.full_name || u.email}</option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2 border-t pt-5 mt-2">
            <h3 className="font-semibold">Closing thank-you from the CEO</h3>
            <p className="text-xs text-muted-foreground mb-3">Admins send this from a closed deal's Finances tab to every contact marked as a client. Use {'{first_name}'}, {'{address}'} and {'{agent}'} in the message.</p>
            <div className="grid sm:grid-cols-2 gap-3">
              {[['ceo_name', 'CEO name'], ['ceo_title', 'Title', 'CEO'], ['ceo_email', 'Replies go to (email)'], ['thank_you_video_url', 'YouTube video link', 'https://youtu.be/...'], ['logo_url', 'Logo image URL'], ['ceo_signature_url', 'Signature image URL'], ['thank_you_subject', 'Email subject', 'Congratulations on your new home!']].map(([k, l, ph]) => (
                <div key={k}><Label>{l}</Label><Input className="mt-1.5" placeholder={ph || ''} value={form[k] || ''} onChange={(e) => setForm({ ...form, [k]: e.target.value })} /></div>
              ))}
              <div className="sm:col-span-2"><Label>Message</Label><Textarea className="mt-1.5" rows={4} placeholder="Congratulations on your new home at {address}! ..." value={form.thank_you_message || ''} onChange={(e) => setForm({ ...form, thank_you_message: e.target.value })} /></div>
            </div>
          </div>
          <div className="sm:col-span-2 border-t pt-5">
            <h3 className="font-semibold mb-2">Commission disbursements</h3>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!form.cda_direct_agent_pay} onChange={(e) => setForm({ ...form, cda_direct_agent_pay: e.target.checked })} /> CDAs tell title to pay agents directly (otherwise title pays the brokerage and we pay agents)</label>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button
            onClick={handleSave}
            disabled={saving || !form.brokerage_name || !form.broker_name}
            className="gap-2 rounded-xl h-11 min-w-[140px]"
          >
            {saved ? (
              <><CheckCircle className="w-4 h-4" /> Saved!</>
            ) : saving ? (
              'Saving...'
            ) : (
              <><Save className="w-4 h-4" /> Save Settings</>
            )}
          </Button>
        </div>
            </div>
          </TabsContent>
        )}

        {isAdmin && (
          <TabsContent value="colors">
            <div className="bg-card rounded-2xl border border-border p-6 space-y-6">
              <div className="space-y-4">
                <div>
                  <Label>Primary Color (Buttons, Accents, Links)</Label>
                  <div className="mt-2 flex items-center gap-3">
                    <input
                      type="color"
                      value={form.primary_color}
                      onChange={(e) => setForm({ ...form, primary_color: e.target.value })}
                      className="w-16 h-16 rounded-lg cursor-pointer border-2 border-border"
                    />
                    <div className="flex-1">
                      <Input
                        value={form.primary_color}
                        onChange={(e) => setForm({ ...form, primary_color: e.target.value })}
                        placeholder="#667eea"
                        className="font-mono text-sm"
                      />
                      <p className="text-xs text-muted-foreground mt-1">Used for buttons, links, and highlights</p>
                    </div>
                  </div>
                </div>
                <div>
                  <Label>Sidebar Color (Navigation Background)</Label>
                  <div className="mt-2 flex items-center gap-3">
                    <input
                      type="color"
                      value={form.sidebar_color}
                      onChange={(e) => setForm({ ...form, sidebar_color: e.target.value })}
                      className="w-16 h-16 rounded-lg cursor-pointer border-2 border-border"
                    />
                    <div className="flex-1">
                      <Input
                        value={form.sidebar_color}
                        onChange={(e) => setForm({ ...form, sidebar_color: e.target.value })}
                        placeholder="#1c231f"
                        className="font-mono text-sm"
                      />
                      <p className="text-xs text-muted-foreground mt-1">Used for the left sidebar and top navigation</p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  onClick={() => setForm({ ...form, primary_color: '#667eea', sidebar_color: '#1a2135' })}
                  variant="outline"
                  className="rounded-xl h-11"
                >
                  Reset to Default
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={saving}
                  className="gap-2 rounded-xl h-11 min-w-[140px]"
                >
                  {saved ? (
                    <><CheckCircle className="w-4 h-4" /> Saved!</>
                  ) : saving ? (
                    'Saving...'
                  ) : (
                    <><Save className="w-4 h-4" /> Save Colors</>
                  )}
                </Button>
              </div>
            </div>
          </TabsContent>
        )}

        {isAdmin && (
          <TabsContent value="tech_links">
            <div className="bg-card rounded-2xl border border-border p-6">
              <TechLinksTab
                links={form.tech_links || []}
                onSave={async (links) => {
                  const updated = { ...form, tech_links: links };
                  setForm(updated);
                  if (settingsId) {
                    await base44.entities.BrokerageSettings.update(settingsId, { tech_links: links });
                  }
                }}
              />
            </div>
          </TabsContent>
        )}

        <TabsContent value="notifications">
          <div className="bg-card rounded-2xl border border-border p-6">
            <NotificationSettings />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}