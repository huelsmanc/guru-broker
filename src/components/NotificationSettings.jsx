import React, { useState, useEffect } from 'react';
import { Bell, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { motion } from 'framer-motion';

export default function NotificationSettings() {
  const [settings, setSettings] = useState({
    urgentChats: true,
    newCalls: true,
    newMessages: true,
    announcements: true,
    pushNotificationsPrompt: true,
  });
  const [saved, setSaved] = useState(false);
  const [notifPermission, setNotifPermission] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'denied'
  );

  useEffect(() => {
    const saved = localStorage.getItem('notificationSettings');
    if (saved) {
      setSettings(JSON.parse(saved));
    }
  }, []);

  const handleToggle = (key) => {
    setSettings(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = () => {
    localStorage.setItem('notificationSettings', JSON.stringify(settings));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const requestPermission = async () => {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      setNotifPermission(permission);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-foreground mb-2">Notification Preferences</h3>
        <p className="text-sm text-muted-foreground">Control how and when you receive alerts</p>
      </div>

      {/* Browser Permission Status */}
      <div className="bg-card rounded-xl border border-border p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Bell className="w-5 h-5 text-primary" />
            <div>
              <p className="font-medium text-sm text-foreground">Browser Notifications</p>
              <p className="text-xs text-muted-foreground">Required for push alerts</p>
            </div>
          </div>
          {notifPermission === 'granted' ? (
            <Badge className="gap-1 bg-green-500/20 text-green-600 border-0">
              <Check className="w-3 h-3" /> Enabled
            </Badge>
          ) : (
            <Button
              size="sm"
              onClick={requestPermission}
              className="rounded-lg text-xs h-8"
            >
              Enable
            </Button>
          )}
        </div>
      </div>

      {/* Notification Types */}
      <div className="space-y-3">
        <div className="bg-card rounded-xl border border-border p-4 flex items-center justify-between">
          <Label className="text-sm font-medium cursor-pointer">Urgent Chats</Label>
          <Switch
            checked={settings.urgentChats}
            onChange={() => handleToggle('urgentChats')}
          />
        </div>

        <div className="bg-card rounded-xl border border-border p-4 flex items-center justify-between">
          <Label className="text-sm font-medium cursor-pointer">New Scheduled Calls</Label>
          <Switch
            checked={settings.newCalls}
            onChange={() => handleToggle('newCalls')}
          />
        </div>

        <div className="bg-card rounded-xl border border-border p-4 flex items-center justify-between">
          <Label className="text-sm font-medium cursor-pointer">New Messages</Label>
          <Switch
            checked={settings.newMessages}
            onChange={() => handleToggle('newMessages')}
          />
        </div>

        <div className="bg-card rounded-xl border border-border p-4 flex items-center justify-between">
          <Label className="text-sm font-medium cursor-pointer">Announcements</Label>
          <Switch
            checked={settings.announcements}
            onChange={() => handleToggle('announcements')}
          />
        </div>

        <div className="bg-card rounded-xl border border-border p-4 flex items-center justify-between">
          <Label className="text-sm font-medium cursor-pointer">Push Notification Prompt</Label>
          <Switch
            checked={settings.pushNotificationsPrompt}
            onChange={() => handleToggle('pushNotificationsPrompt')}
          />
        </div>
        </div>

      {/* Save Button */}
      <div className="flex justify-end">
        {saved ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex items-center gap-2 text-green-600 text-sm"
          >
            <Check className="w-4 h-4" /> Settings saved
          </motion.div>
        ) : (
          <Button onClick={handleSave} className="rounded-lg">
            Save Preferences
          </Button>
        )}
      </div>
    </div>
  );
}