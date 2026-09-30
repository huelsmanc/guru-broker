import React, { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export default function VideoConferenceModal({ open, onOpenChange, callId, topic }) {
  const apiRef = useRef(null);
  const [loading, setLoading] = useState(true);

  // Pre-load Jitsi script on mount
  useEffect(() => {
    if (!window.JitsiMeetExternalAPI) {
      const script = document.createElement('script');
      script.src = 'https://meet.jit.si/external_api.js';
      script.async = true;
      document.body.appendChild(script);
    }
  }, []);

  useEffect(() => {
    if (!open || !callId) return;

    setLoading(true);
    const initializeJitsi = () => {
      const container = document.getElementById('jitsi-container');
      if (container && window.JitsiMeetExternalAPI) {
        try {
          apiRef.current = new window.JitsiMeetExternalAPI('meet.jit.si', {
            roomName: `call-${callId}`.toLowerCase(),
            width: '100%',
            height: '100%',
            parentNode: container,
            configOverwrite: {
              startWithAudioMuted: false,
              startWithVideoMuted: false,
            },
            interfaceConfigOverwrite: {
              MOBILE_APP_PROMO: false,
              TOOLBAR_BUTTONS: ['microphone', 'camera', 'desktop', 'fullscreen', 'hangup'],
            },
          });
          setLoading(false);
        } catch (error) {
          console.error('Jitsi initialization error:', error);
          setLoading(false);
        }
      }
    };

    // Wait for Jitsi API to be available
    const checkApi = setInterval(() => {
      if (window.JitsiMeetExternalAPI) {
        clearInterval(checkApi);
        initializeJitsi();
      }
    }, 50);

    return () => {
      clearInterval(checkApi);
      if (apiRef.current) {
        apiRef.current.dispose();
        apiRef.current = null;
      }
    };
  }, [open, callId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl h-[85vh] p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b border-border">
          <DialogTitle>{topic}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 w-full relative overflow-hidden">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background z-10">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
                <p className="text-sm text-muted-foreground">Starting video call...</p>
              </div>
            </div>
          )}
          <div id="jitsi-container" className="w-full h-full" />
        </div>
      </DialogContent>
    </Dialog>
  );
}