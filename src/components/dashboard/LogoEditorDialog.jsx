import React, { useState, useRef } from 'react';
import Cropper from 'react-easy-crop';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';

export default function LogoEditorDialog({ open, onOpenChange, logoUrl, brokerageSettings, onSave }) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();

  const onCropComplete = (croppedArea, croppedAreaPixels) => {
    setCroppedAreaPixels(croppedAreaPixels);
  };

  const handleSaveCrop = async () => {
    if (!croppedAreaPixels || !logoUrl || !brokerageSettings) return;

    setSaving(true);
    try {
      const image = new Image();
      image.crossOrigin = 'anonymous';
      
      image.onerror = () => {
        console.error('Failed to load image');
        setSaving(false);
      };
      
      image.onload = async () => {
        try {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          canvas.width = croppedAreaPixels.width;
          canvas.height = croppedAreaPixels.height;
          
          ctx.drawImage(
            image,
            croppedAreaPixels.x,
            croppedAreaPixels.y,
            croppedAreaPixels.width,
            croppedAreaPixels.height,
            0,
            0,
            croppedAreaPixels.width,
            croppedAreaPixels.height
          );

          canvas.toBlob(async (blob) => {
            if (!blob) {
              console.error('Failed to create blob from canvas');
              setSaving(false);
              return;
            }
            
            try {
              const file = new File([blob], 'logo-cropped.png', { type: 'image/png' });
              const uploadRes = await base44.integrations.Core.UploadFile({ file });
              const file_url = uploadRes?.file_url || uploadRes?.data?.file_url;
              
              if (!file_url) {
                console.error('No file_url in upload response:', uploadRes);
                setSaving(false);
                return;
              }
              
              console.log('Uploaded to:', file_url);
              const updateRes = await base44.entities.BrokerageSettings.update(brokerageSettings.id, { logo_url: file_url });
              console.log('Update response:', updateRes);
              
              setSaving(false);
              onOpenChange(false);
              onSave && onSave();
            } catch (uploadError) {
              console.error('Upload/update failed:', uploadError);
              setSaving(false);
            }
          }, 'image/png');
        } catch (drawError) {
          console.error('Canvas draw failed:', drawError);
          setSaving(false);
        }
      };
      
      image.src = logoUrl;
    } catch (error) {
      console.error('Crop save failed:', error);
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Crop & Zoom Logo</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {logoUrl && (
            <div className="relative w-full bg-muted rounded-lg overflow-hidden" style={{ height: '400px' }}>
              <Cropper
                image={logoUrl}
                crop={crop}
                zoom={zoom}
                aspect={undefined}
                onCropChange={setCrop}
                onCropComplete={onCropComplete}
                onZoomChange={setZoom}
              />
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Zoom</label>
            <Slider
              value={[zoom]}
              onValueChange={(val) => setZoom(val[0])}
              min={1}
              max={3}
              step={0.1}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">{Math.round(zoom * 100)}%</p>
          </div>

          <p className="text-xs text-muted-foreground">
            Drag to move • Scroll to zoom • Adjust the crop area to focus on your logo content
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSaveCrop} disabled={saving} className="bg-primary hover:bg-primary/90">
            {saving ? 'Saving...' : 'Save Crop'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}