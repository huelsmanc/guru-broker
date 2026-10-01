import React, { useState, useRef } from 'react';
import { Mic, Square, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { cn } from '@/lib/utils';

export default function VoiceMemoButton({ onSend, onStage, disabled, scope }) {
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

  const startRecording = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    // Pick the best supported MIME type
    const mimeType = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg']
      .find(t => MediaRecorder.isTypeSupported(t)) || '';

    const mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
    mediaRecorderRef.current = mediaRecorder;
    chunksRef.current = [];

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    mediaRecorder.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      const effectiveMime = mediaRecorder.mimeType || 'audio/webm';
      const ext = effectiveMime.includes('mp4') ? 'mp4' : effectiveMime.includes('ogg') ? 'ogg' : 'webm';
      const blob = new Blob(chunksRef.current, { type: effectiveMime });
      const file = new File([blob], `voice-memo.${ext}`, { type: effectiveMime });
      setUploading(true);
      try {
        const uploadRes = await base44.integrations.Core.UploadFile({ file, scope });
        const file_url = uploadRes.file_url || uploadRes.data?.file_url;
        setUploading(false);
        if (file_url) {
          if (onStage) {
            onStage(`[voice_memo]${file_url}`);
          } else {
            onSend(`[voice_memo]${file_url}`);
          }
        }
      } catch (error) {
        setUploading(false);
        console.error('Voice memo upload failed:', error);
      }
    };

    mediaRecorder.start();
    setRecording(true);
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  };

  const handleClick = () => {
    if (recording) stopRecording();
    else startRecording();
  };

  return (
    <Button
      type="button"
      onClick={handleClick}
      disabled={disabled || uploading}
      variant={recording ? 'destructive' : 'outline'}
      className={cn('h-11 w-11 rounded-xl p-0 flex-shrink-0', recording && 'animate-pulse')}
      title={recording ? 'Stop recording' : 'Record voice memo'}
    >
      {uploading ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : recording ? (
        <Square className="w-4 h-4" />
      ) : (
        <Mic className="w-4 h-4" />
      )}
    </Button>
  );
}