import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Mic, MicOff, Play, Trash2, Loader2, Radio } from 'lucide-react';
import { motion } from 'framer-motion';
import { format } from 'date-fns';

export default function AudioAnnouncement({ brokerageId, user, isAdmin }) {
  const queryClient = useQueryClient();
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

  const { data: audioAnnouncement } = useQuery({
    queryKey: ['audio-announcement', brokerageId],
    queryFn: async () => {
      const results = await base44.entities.DashboardAnnouncement.filter(
        { brokerage_id: brokerageId },
        '-created_date',
        10
      );
      return results.find(r => r.audio_url) || null;
    },
    enabled: !!brokerageId,
  });

  const saveMutation = useMutation({
    mutationFn: async (audioUrl) => {
      // Remove any old audio announcement first
      if (audioAnnouncement) {
        await base44.entities.DashboardAnnouncement.update(audioAnnouncement.id, {
          audio_url: audioUrl,
          posted_by_name: user.full_name,
          posted_by_email: user.email,
        });
      } else {
        await base44.entities.DashboardAnnouncement.create({
          brokerage_id: brokerageId,
          message: `🎙️ Voice message from ${user.full_name}`,
          audio_url: audioUrl,
          posted_by_email: user.email,
          posted_by_name: user.full_name,
        });
      }
      queryClient.invalidateQueries({ queryKey: ['audio-announcement', brokerageId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => base44.entities.DashboardAnnouncement.delete(audioAnnouncement.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['audio-announcement', brokerageId] }),
  });

  const startRecording = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
    const mr = new MediaRecorder(stream, { mimeType });
    chunksRef.current = [];
    mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    mr.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      setUploading(true);
      const blob = new Blob(chunksRef.current, { type: mimeType });
      const file = new File([blob], `voice-note.${mimeType.split('/')[1]}`, { type: mimeType });
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      await saveMutation.mutateAsync(file_url);
      setUploading(false);
    };
    mr.start();
    mediaRecorderRef.current = mr;
    setRecording(true);
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  };

  if (!audioAnnouncement && !isAdmin) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gradient-to-r from-accent/10 to-primary/10 border border-accent/20 rounded-2xl p-5 flex items-center gap-4 h-full"
    >
      <div className="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center flex-shrink-0">
        <Radio className="w-5 h-5 text-accent" />
      </div>

      <div className="flex-1 min-w-0">
        {audioAnnouncement ? (
          <>
            <p className="text-xs font-semibold text-accent uppercase tracking-wide mb-1">
              Voice Note from {audioAnnouncement.posted_by_name}
            </p>
            <audio
              src={audioAnnouncement.audio_url}
              controls
              className="w-full h-8 max-w-sm"
              preload="metadata"
            />
            <p className="text-xs text-muted-foreground mt-1">
              {audioAnnouncement.created_date
                ? format(new Date(audioAnnouncement.created_date), 'MMM d, h:mm a')
                : ''}
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground italic">No voice announcement yet</p>
        )}
      </div>

      {isAdmin && (
        <div className="flex items-center gap-2 flex-shrink-0">
          {uploading ? (
            <Loader2 className="w-5 h-5 animate-spin text-accent" />
          ) : recording ? (
            <Button
              onClick={stopRecording}
              size="sm"
              className="gap-1.5 rounded-xl bg-destructive hover:bg-destructive/90 text-white animate-pulse"
            >
              <MicOff className="w-4 h-4" /> Stop
            </Button>
          ) : (
            <Button
              onClick={startRecording}
              size="sm"
              variant="outline"
              className="gap-1.5 rounded-xl border-accent/40 text-accent hover:bg-accent/10"
            >
              <Mic className="w-4 h-4" /> Record
            </Button>
          )}
          {audioAnnouncement && !recording && !uploading && (
            <Button
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
              size="icon"
              variant="ghost"
              className="rounded-xl text-destructive hover:text-destructive"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>
      )}
    </motion.div>
  );
}