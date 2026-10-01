import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Phone, Plus, Calendar, Clock, CheckCircle, XCircle, Video } from 'lucide-react';
import { format } from 'date-fns';
import { motion } from 'framer-motion';
import { useCalls } from '@/lib/chat/CallProvider';
import { isAdminRole, normalizeRole, can } from '../../shared/permissions.generated.js';

const timeSlots = [
  '9:00 AM', '9:30 AM', '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM',
  '12:00 PM', '12:30 PM', '1:00 PM', '1:30 PM', '2:00 PM', '2:30 PM',
  '3:00 PM', '3:30 PM', '4:00 PM', '4:30 PM', '5:00 PM',
];

export default function ScheduleCalls() {
  const { user, brokerageId } = useOutletContext();
  const queryClient = useQueryClient();
  const isAdmin = isAdminRole(user?.role);
  const [showDialog, setShowDialog] = useState(false);
  const [showPhoneEditor, setShowPhoneEditor] = useState(false);
  const callSystem = useCalls();
  const [form, setForm] = useState({ date: '', time: '', topic: '', notes: '', call_type: 'phone' });
  const [supportPhone, setSupportPhone] = useState('');

  const { data: settings } = useQuery({
    queryKey: ['brokerage-settings', brokerageId],
    queryFn: () => base44.entities.BrokerageSettings.filter({ brokerage_id: brokerageId }),
    enabled: !!brokerageId,
  });

  // Sync support phone when settings load
  React.useEffect(() => {
    if (settings?.[0]?.brokerage_phone) {
      setSupportPhone(settings[0].brokerage_phone);
    }
  }, [settings]);

  const { data: calls = [] } = useQuery({
    queryKey: ['scheduled-calls', user?.email],
    queryFn: () => isAdmin
      ? base44.entities.ScheduledCall.filter({ brokerage_id: brokerageId }, '-created_date', 50)
      : base44.entities.ScheduledCall.filter({ agent_email: user?.email, brokerage_id: brokerageId }, '-created_date', 50),
    enabled: !!user && !!brokerageId,
  });

  const createCall = useMutation({
    mutationFn: (data) => base44.entities.ScheduledCall.create({
      ...data,
      agent_email: user.email,
      agent_name: user.full_name,
      brokerage_id: brokerageId,
      status: 'scheduled',
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduled-calls'] });
      setShowDialog(false);
      setForm({ date: '', time: '', topic: '', notes: '', call_type: 'phone' });
    },
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }) => base44.entities.ScheduledCall.update(id, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['scheduled-calls'] }),
  });

  const updatePhoneMutation = useMutation({
    mutationFn: async () => {
      if (settings?.[0]?.id) {
        await base44.entities.BrokerageSettings.update(settings[0].id, { brokerage_phone: supportPhone });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brokerage-settings', brokerageId] });
      setShowPhoneEditor(false);
    },
  });

  const scheduledCalls = calls.filter(c => c.status === 'scheduled');
  const pastCalls = calls.filter(c => c.status !== 'scheduled');

  return (
    <div className="p-6 lg:p-10 max-w-5xl mx-auto">
      {/* Support Line Banner */}
      {supportPhone && (
        <div className="bg-accent/5 border border-accent/20 rounded-2xl p-4 mb-6 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-accent uppercase tracking-wide">Company Support Line</p>
            <a href={`tel:${supportPhone.replace(/\D/g, '')}`} className="text-lg font-bold text-accent hover:opacity-80 transition-opacity">
              {supportPhone}
            </a>
          </div>
          {isAdmin && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowPhoneEditor(true)}
              className="rounded-lg"
            >
              Edit
            </Button>
          )}
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-foreground tracking-tight">
            {isAdmin ? 'Scheduled Calls' : 'Schedule a Call'}
          </h1>
          <p className="text-muted-foreground mt-1">
            {isAdmin ? 'Manage upcoming calls with agents' : 'Book a call with your broker'}
          </p>
        </div>
        <div className="flex gap-2">
          {isAdmin && !supportPhone && (
            <Button onClick={() => setShowPhoneEditor(true)} variant="outline" className="gap-2 rounded-xl h-11">
              <Phone className="w-4 h-4" /> Add Support Line
            </Button>
          )}
          {!isAdmin && (
            <Button onClick={() => setShowDialog(true)} className="gap-2 rounded-xl h-11">
              <Plus className="w-4 h-4" /> Schedule Call
            </Button>
          )}
        </div>
      </div>

      {/* Upcoming Calls */}
      <h2 className="text-lg font-semibold mb-4">Upcoming</h2>
      {scheduledCalls.length === 0 ? (
        <div className="bg-card rounded-2xl border border-border p-12 text-center mb-8">
          <Phone className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground">No upcoming calls</p>
        </div>
      ) : (
        <div className="grid gap-3 mb-8">
          {scheduledCalls.map((call, i) => (
            <motion.div
              key={call.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="bg-card rounded-2xl border border-border p-5 flex flex-col md:flex-row md:items-center gap-4"
            >
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${call.call_type === 'video' ? 'bg-accent/10' : 'bg-primary/10'}`}>
                {call.call_type === 'video' ? (
                  <Video className="w-5 h-5 text-accent" />
                ) : (
                  <Phone className="w-5 h-5 text-primary" />
                )}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-foreground">{call.topic}</p>
                  <Badge variant="outline" className="text-xs capitalize">
                    {call.call_type === 'video' ? '📹 Video' : '☎️ Phone'}
                  </Badge>
                </div>
                {isAdmin && <p className="text-xs text-muted-foreground">Agent: {call.agent_name}</p>}
                <div className="flex items-center gap-3 mt-1.5">
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {call.date ? format(new Date(call.date), 'MMM d, yyyy') : ''}
                  </span>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {call.time}
                  </span>
                </div>
                {call.notes && <p className="text-xs text-muted-foreground mt-1">{call.notes}</p>}
              </div>
              {isAdmin && (
                <div className="flex items-center gap-2">
                  {call.call_type === 'video' && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1 rounded-xl text-xs"
                      onClick={() => callSystem?.start('scheduled', call.id, true)}
                    >
                      <Video className="w-3.5 h-3.5" /> Join
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1 rounded-xl text-xs"
                    onClick={() => updateStatus.mutate({ id: call.id, status: 'completed' })}
                  >
                    <CheckCircle className="w-3.5 h-3.5" /> Complete
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="gap-1 rounded-xl text-xs text-destructive"
                    onClick={() => updateStatus.mutate({ id: call.id, status: 'cancelled' })}
                  >
                    <XCircle className="w-3.5 h-3.5" /> Cancel
                  </Button>
                </div>
              )}
            </motion.div>
          ))}
        </div>
      )}

      {/* Past Calls */}
      {pastCalls.length > 0 && (
        <>
          <h2 className="text-lg font-semibold mb-4">Past Calls</h2>
          <div className="grid gap-3">
            {pastCalls.map((call) => (
              <div key={call.id} className="bg-card rounded-2xl border border-border p-5 opacity-60 flex items-center gap-4">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${call.call_type === 'video' ? 'bg-accent/10' : 'bg-muted'}`}>
                  {call.call_type === 'video' ? (
                    <Video className="w-5 h-5 text-accent" />
                  ) : (
                    <Phone className="w-5 h-5 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-foreground">{call.topic}</p>
                    <span className="text-[10px] text-muted-foreground">{call.call_type === 'video' ? '📹 Video' : '☎️ Phone'}</span>
                  </div>
                  {isAdmin && <p className="text-xs text-muted-foreground">Agent: {call.agent_name}</p>}
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs text-muted-foreground">
                      {call.date ? format(new Date(call.date), 'MMM d, yyyy') : ''} · {call.time}
                    </span>
                  </div>
                </div>
                <Badge variant="secondary" className="capitalize text-xs">{call.status}</Badge>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Edit Support Line Dialog */}
      <Dialog open={showPhoneEditor} onOpenChange={setShowPhoneEditor}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Support Line Number</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Phone Number</Label>
              <Input
                value={supportPhone}
                onChange={(e) => setSupportPhone(e.target.value)}
                placeholder="(555) 123-4567"
                className="mt-1.5"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPhoneEditor(false)}>Cancel</Button>
            <Button
              onClick={() => updatePhoneMutation.mutate()}
              disabled={!supportPhone || updatePhoneMutation.isPending}
            >
              {updatePhoneMutation.isPending ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Schedule Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Schedule a Call</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Topic</Label>
              <Input
                value={form.topic}
                onChange={(e) => setForm({ ...form, topic: e.target.value })}
                placeholder="What would you like to discuss?"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label>Date</Label>
              <Input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label>Time</Label>
              <Select value={form.time} onValueChange={(v) => setForm({ ...form, time: v })}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Select a time" />
                </SelectTrigger>
                <SelectContent>
                  {timeSlots.map(t => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Call Type</Label>
              <Select value={form.call_type} onValueChange={(v) => setForm({ ...form, call_type: v })}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Select call type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="phone">☎️ Phone Call</SelectItem>
                  <SelectItem value="video">📹 Video Call</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Notes (optional)</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Any additional details..."
                className="mt-1.5"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button
              onClick={() => createCall.mutate(form)}
              disabled={!form.topic || !form.date || !form.time || createCall.isPending}
            >
              {createCall.isPending ? 'Scheduling...' : 'Schedule Call'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}