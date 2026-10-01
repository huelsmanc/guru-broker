import React, { useState, useEffect, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import MobilePageHeader from '@/components/layout/MobilePageHeader';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Camera, Save, CheckCircle, User, Calendar, Clock, Heart, Trash2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import ImageCropModal from '@/components/profile/ImageCropModal';
import DeleteAccountDialog from '@/components/profile/DeleteAccountDialog';
import NotificationSettings from '@/components/NotificationSettings';
import SecuritySettings from '@/components/auth/SecuritySettings';
import WorkspaceChecklists from '@/components/workspace/WorkspaceChecklists';
import { useQuery as useQueryOnboarding } from '@tanstack/react-query';
import { format, differenceInDays } from 'date-fns';
import { isAdminRole, normalizeRole, can } from '../../shared/permissions.generated.js';

export default function Profile() {
  const { user, brokerageId } = useOutletContext();
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [headshot, setHeadshot] = useState(user?.headshot || '');
  const [cropSrc, setCropSrc] = useState(null);
  const [fullName, setFullName] = useState(user?.full_name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [title, setTitle] = useState(user?.title || '');
  const [birthday, setBirthday] = useState(user?.birthday || '');
  const [workAnniversary, setWorkAnniversary] = useState(user?.work_anniversary || '');
  const [agentStatus, setAgentStatus] = useState(user?.agent_status || 'offline');
  const [timezone, setTimezone] = useState(user?.timezone || 'America/New_York');
  const [googleReviewUrl, setGoogleReviewUrl] = useState(user?.google_review_url || '');
  const isAgent = normalizeRole(user?.role) === 'agent';

  const { data: cultureEvents = [] } = useQuery({
    queryKey: ['culture-events-profile', brokerageId],
    queryFn: () => base44.entities.CultureCalendarEntry.filter({ brokerage_id: brokerageId }, '-date', 100),
    enabled: !!brokerageId,
  });

  const { data: rsvps = [] } = useQuery({
    queryKey: ['user-rsvps', user?.email],
    queryFn: () => base44.entities.CultureCalendarRSVP.filter({ user_email: user?.email }, '-created_date', 500),
    enabled: !!user?.email,
  });

  useEffect(() => {
    base44.auth.me().then((u) => {
      setHeadshot(u?.headshot || '');
      setFullName(u?.full_name || u?.display_name || '');
      setPhone(u?.phone || '');
      setTitle(u?.title || '');
      setBirthday(u?.birthday || '');
      setWorkAnniversary(u?.work_anniversary || '');
      setAgentStatus(u?.agent_status || 'offline');
      setTimezone(u?.timezone || 'America/New_York');
      setGoogleReviewUrl(u?.google_review_url || '');
    });
  }, []);

  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCropSrc(reader.result);
    reader.readAsDataURL(file);
    // Reset input so same file can be re-selected
    e.target.value = '';
  };

  const handleCropSave = async (croppedFile) => {
    setUploading(true);
    setCropSrc(null);
    const { file_url } = await base44.integrations.Core.UploadFile({ file: croppedFile });
    setHeadshot(file_url);
    setUploading(false);
  };

  const handleSave = async () => {
    setSaving(true);
    const updateData = { headshot, phone, title, birthday: birthday || null, work_anniversary: workAnniversary || null, timezone, google_review_url: googleReviewUrl };
    if (fullName.trim()) { updateData.full_name = fullName.trim(); updateData.display_name = fullName.trim(); }
    if (isAgent) updateData.agent_status = agentStatus;
    await base44.auth.updateMe(updateData);
    window.dispatchEvent(new Event('profile-updated')); // sidebar and chat pick up the new name

    // Sync dates to culture calendar
    if (birthday || workAnniversary) {
      await base44.functions.invoke('syncUserDatesToCultureCalendar', { birthday, work_anniversary: workAnniversary });
    }

    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const roleLabel = isAdminRole(user?.role) ? 'Broker / Admin' : user?.role === 'super_admin' ? 'Super Admin' : 'Agent';

  // Filter upcoming events and attendance history
  const now = new Date();
  const userEventRSVPs = rsvps.map(rsvp => {
    const event = cultureEvents.find(e => e.id === rsvp.culture_calendar_entry_id);
    return event ? { ...event, rsvp } : null;
  }).filter(Boolean);

  const upcomingEvents = userEventRSVPs
    .filter(e => new Date(e.date) >= now)
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(0, 3);

  const pastEvents = userEventRSVPs
    .filter(e => new Date(e.date) < now && e.rsvp?.status === 'attending')
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 5);

  // Calculate days until birthday/anniversary
  const getUpcomingDate = (dateStr) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    const thisYear = new Date(now.getFullYear(), date.getMonth(), date.getDate());
    if (thisYear < now) {
      thisYear.setFullYear(thisYear.getFullYear() + 1);
    }
    return { date: thisYear, daysUntil: differenceInDays(thisYear, now) };
  };

  const birthdayInfo = getUpcomingDate(birthday);
  const anniversaryInfo = getUpcomingDate(workAnniversary);

  return (
    <>
    <MobilePageHeader title="Profile" />
    <div className="p-6 lg:p-10 max-w-4xl mx-auto space-y-8">

      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <h1 className="text-2xl lg:text-3xl font-bold text-foreground tracking-tight">My Profile</h1>
        <p className="text-muted-foreground mt-1">Manage your information and track your culture calendar activity.</p>
      </motion.div>

      {/* Personal Info Section */}
      <div className="bg-card rounded-2xl border border-border p-6 space-y-6">
        {/* Headshot */}
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-28 h-28 rounded-full border-4 border-border overflow-hidden bg-muted flex items-center justify-center">
              {headshot ? (
                <img src={headshot} alt="Headshot" className="w-full h-full object-cover" />
              ) : (
                <User className="w-12 h-12 text-muted-foreground/40" />
              )}
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="absolute bottom-0 right-0 w-9 h-9 bg-primary rounded-full flex items-center justify-center border-2 border-card hover:bg-primary/90 transition-colors"
            >
              {uploading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Camera className="w-4 h-4 text-white" />
              )}
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
          </div>
          <div className="text-center">
            <p className="font-semibold text-foreground">{user?.full_name}</p>
            <p className="text-sm text-muted-foreground">{roleLabel}</p>
          </div>
        </div>

        <hr className="border-border" />

        {/* Read-only info */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label className="text-muted-foreground text-xs">Full Name</Label>
            <Input className="mt-1" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your first and last name" />
          </div>
          <div>
            <Label className="text-muted-foreground text-xs">Email</Label>
            <p className="mt-1 text-sm font-medium text-foreground">{user?.email}</p>
          </div>
        </div>

        {/* Editable fields */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
           <div>
             <Label>Title</Label>
             <Input
               value={title}
               onChange={(e) => setTitle(e.target.value)}
               placeholder="e.g. Senior Agent"
               className="mt-1.5"
             />
           </div>
           <div>
             <Label>Phone</Label>
             <Input
               value={phone}
               onChange={(e) => setPhone(e.target.value)}
               placeholder="e.g. (555) 123-4567"
               className="mt-1.5"
             />
           </div>
           <div>
             <Label>Timezone</Label>
             <select
               value={timezone}
               onChange={(e) => setTimezone(e.target.value)}
               className="w-full mt-1.5 px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
             >
               <option value="America/New_York">Eastern (ET)</option>
               <option value="America/Chicago">Central (CT)</option>
               <option value="America/Denver">Mountain (MT)</option>
               <option value="America/Los_Angeles">Pacific (PT)</option>
               <option value="America/Anchorage">Alaska (AKT)</option>
               <option value="Pacific/Honolulu">Hawaii (HST)</option>
               <option value="Europe/London">London (GMT)</option>
               <option value="Europe/Paris">Central Europe (CET)</option>
               <option value="Asia/Tokyo">Tokyo (JST)</option>
               <option value="Australia/Sydney">Sydney (AEDT)</option>
             </select>
           </div>
           <div>
             <Label>Birthday</Label>
             <Input
               type="date"
               value={birthday}
               onChange={(e) => setBirthday(e.target.value)}
               className="mt-1.5"
             />
           </div>
           <div>
             <Label>Work Anniversary</Label>
             <Input
               type="date"
               value={workAnniversary}
               onChange={(e) => setWorkAnniversary(e.target.value)}
               className="mt-1.5"
             />
           </div>
           <div className="sm:col-span-2">
             <Label>Google Review Link</Label>
             <Input
               value={googleReviewUrl}
               onChange={(e) => setGoogleReviewUrl(e.target.value)}
               placeholder="https://g.page/r/your-review-link"
               className="mt-1.5"
             />
             <p className="text-xs text-muted-foreground mt-1">This link will automatically appear in closing thank-you emails to your clients.</p>
           </div>
         </div>

         {isAgent && (
           <div>
             <Label>Availability Status</Label>
             <div className="flex gap-3 mt-2">
               {['available', 'busy', 'offline'].map((status) => (
                 <button
                   key={status}
                   onClick={() => setAgentStatus(status)}
                   className={`flex-1 py-2 rounded-xl border-2 transition-all ${
                     agentStatus === status
                       ? 'border-primary bg-primary/10'
                       : 'border-border hover:border-primary/30'
                   }`}
                 >
                   <Badge
                     variant={
                       status === 'available'
                         ? 'default'
                         : status === 'busy'
                         ? 'secondary'
                         : 'outline'
                     }
                     className={`text-xs capitalize ${
                       status === 'available' ? 'bg-green-500' : status === 'busy' ? 'bg-yellow-500' : ''
                     }`}
                   >
                     {status}
                   </Badge>
                 </button>
               ))}
             </div>
             <p className="text-xs text-muted-foreground mt-2">Your status is visible to brokers. Messages are only routed to Available or Busy agents.</p>
           </div>
         )}

        <MyOnboarding user={user} />

        <div className="rounded-2xl border p-5"><NotificationSettings /></div>

        <div className="rounded-2xl border p-5"><SecuritySettings user={user} /></div>

        <div className="flex items-center justify-between gap-3">
          <Button
            onClick={() => setShowDeleteDialog(true)}
            variant="destructive"
            className="gap-2 rounded-xl h-11"
          >
            <Trash2 className="w-4 h-4" /> Delete Account
          </Button>
          <Button onClick={handleSave} disabled={saving} className="gap-2 rounded-xl h-11 min-w-[140px]">
            {saved ? (
              <><CheckCircle className="w-4 h-4" /> Saved!</>
            ) : saving ? 'Saving...' : (
              <><Save className="w-4 h-4" /> Save Profile</>
            )}
          </Button>
        </div>
      </div>

      {/* Milestones Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {birthdayInfo && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-gradient-to-br from-pink-50 to-rose-50 dark:from-pink-950/20 dark:to-rose-950/20 rounded-2xl border border-pink-200/50 dark:border-pink-800/50 p-6">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-pink-200/50 dark:bg-pink-900/50 flex items-center justify-center flex-shrink-0">
                <span className="text-lg">🎂</span>
              </div>
              <div className="flex-1">
                <p className="font-semibold text-foreground">Birthday</p>
                <p className="text-sm text-muted-foreground">{format(new Date(birthday), 'MMMM d')}</p>
                {birthdayInfo.daysUntil === 0 ? (
                  <Badge className="mt-2 bg-pink-500 text-white">🎉 Today!</Badge>
                ) : (
                  <p className="text-xs text-muted-foreground mt-2">{birthdayInfo.daysUntil} day{birthdayInfo.daysUntil !== 1 ? 's' : ''} away</p>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {anniversaryInfo && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-950/20 dark:to-cyan-950/20 rounded-2xl border border-blue-200/50 dark:border-blue-800/50 p-6">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-200/50 dark:bg-blue-900/50 flex items-center justify-center flex-shrink-0">
                <Heart className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-foreground">Work Anniversary</p>
                <p className="text-sm text-muted-foreground">{format(new Date(workAnniversary), 'MMMM d')}</p>
                {anniversaryInfo.daysUntil === 0 ? (
                  <Badge className="mt-2 bg-blue-500 text-white">🎊 Today!</Badge>
                ) : (
                  <p className="text-xs text-muted-foreground mt-2">{anniversaryInfo.daysUntil} day{anniversaryInfo.daysUntil !== 1 ? 's' : ''} away</p>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </div>

      {/* Upcoming Culture Events */}
      {upcomingEvents.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Calendar className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">Upcoming Events</h2>
          </div>
          <div className="space-y-3">
            {upcomingEvents.map((event, idx) => (
              <motion.div
                key={event.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.05 }}
                className="bg-card rounded-xl border border-border p-4 hover:border-primary/30 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <p className="font-semibold text-foreground">{event.title}</p>
                    <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      {format(new Date(event.date), 'MMM d, yyyy')}
                    </div>
                    {event.description && <p className="text-xs text-muted-foreground mt-1">{event.description}</p>}
                  </div>
                  <Badge variant={event.rsvp?.status === 'attending' ? 'default' : 'secondary'} className="text-xs capitalize flex-shrink-0">
                    {event.rsvp?.status}
                  </Badge>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Past Attendance History */}
      {pastEvents.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-5 h-5 text-accent" />
            <h2 className="text-lg font-semibold text-foreground">Attendance History</h2>
          </div>
          <div className="space-y-2">
            {pastEvents.map((event, idx) => (
              <motion.div
                key={event.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.05 }}
                className="bg-muted/40 rounded-lg px-4 py-2.5 flex items-center justify-between text-sm"
              >
                <div>
                  <p className="font-medium text-foreground">{event.title}</p>
                  <p className="text-xs text-muted-foreground">{format(new Date(event.date), 'MMM d, yyyy')}</p>
                </div>
                <Badge variant="outline" className="text-xs">✓ Attended</Badge>
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </div>

    {cropSrc && (
      <ImageCropModal
        imageSrc={cropSrc}
        onSave={handleCropSave}
        onCancel={() => setCropSrc(null)}
      />
    )}

    <DeleteAccountDialog
      open={showDeleteDialog}
      onOpenChange={setShowDeleteDialog}
      userEmail={user?.email}
      userName={user?.full_name}
    />
    </>
  );
}
// The agent's own onboarding checklist (documents to upload, tasks), when they have one.
function MyOnboarding({ user }) {
  const { data: count = 0 } = useQueryOnboarding({
    queryKey: ['my-onboarding-count', user?.email],
    queryFn: async () => (await base44.entities.Checklist.filter({ subject_type: 'onboarding', subject_email: String(user.email).toLowerCase() }, 'created_date', 5)).length,
    enabled: !!user?.email,
  });
  if (!count) return null;
  return (
    <div id="onboarding" className="rounded-2xl border p-5 scroll-mt-20">
      <WorkspaceChecklists tx={null} user={user} subjectType="onboarding" subjectEmail={String(user.email).toLowerCase()} subjectUserId={user.id} title="My onboarding" />
    </div>
  );
}
