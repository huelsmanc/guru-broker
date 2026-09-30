import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Star, Send, X, ExternalLink } from 'lucide-react';

export default function ClosingReviewPrompt({ tx, user, open, onClose }) {
  const [clientEmail, setClientEmail] = useState('');
  const [clientName, setClientName] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [googleReviewUrl, setGoogleReviewUrl] = useState('');
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  // Pre-fill client info from transaction
  useEffect(() => {
    if (!open) return;
    const buyers = tx.buyers?.filter(Boolean) || [];
    setClientName(buyers[0] || tx.buyer_name || '');
    setClientEmail('');
    setSent(false);

    // Load agent's Google review URL
    base44.auth.me().then(u => {
      setGoogleReviewUrl(u?.google_review_url || '');
    });
  }, [open, tx]);

  const generateEmail = async () => {
    if (!clientName) return;
    setGenerating(true);
    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `Write a warm, professional post-closing thank-you email from real estate agent "${user.full_name}" to their client "${clientName}" for the property at "${tx.property_address}". 
      The tone should be personal, genuine, and celebratory. Keep it to 3 short paragraphs.
      ${googleReviewUrl ? `At the end, naturally invite them to leave a Google review with this link: ${googleReviewUrl}` : 'End with a warm closing.'}
      Do NOT include subject line, just the email body starting with "Dear [Name]," and signed off with the agent's name.`,
    });
    setEmailBody(result);
    setGenerating(false);
  };

  const handleSend = async () => {
    if (!clientEmail || !emailBody) return;
    setSending(true);
    const subject = `Congratulations on your new home! 🏠`;
    const htmlBody = `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#333;line-height:1.7;">
        ${emailBody.replace(/\n/g, '<br/>')}
        ${googleReviewUrl ? `
        <br/><br/>
        <div style="text-align:center;margin-top:24px;">
          <a href="${googleReviewUrl}" style="display:inline-block;background:#4285F4;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">
            ⭐ Leave a Google Review
          </a>
        </div>
        ` : ''}
      </div>
    `;
    await base44.integrations.Core.SendEmail({ to: clientEmail, subject, body: htmlBody });
    setSending(false);
    setSent(true);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Star className="w-5 h-5 text-yellow-500 fill-yellow-400" />
            Send Client Appreciation Email
          </DialogTitle>
        </DialogHeader>

        {sent ? (
          <div className="py-8 text-center">
            <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Send className="w-6 h-6 text-green-600" />
            </div>
            <p className="font-semibold text-foreground text-lg">Email Sent! 🎉</p>
            <p className="text-muted-foreground text-sm mt-1">Your client appreciation email was sent to {clientEmail}.</p>
            <Button className="mt-6 w-full" onClick={onClose}>Done</Button>
          </div>
        ) : (
          <>
            <div className="space-y-4 py-2">
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
                🏠 <strong>{tx.property_address}</strong> just closed! Would you like to send your clients a thank-you with a Google review link?
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Client Name</Label>
                  <Input
                    value={clientName}
                    onChange={e => setClientName(e.target.value)}
                    placeholder="Jane Smith"
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label>Client Email *</Label>
                  <Input
                    type="email"
                    value={clientEmail}
                    onChange={e => setClientEmail(e.target.value)}
                    placeholder="client@email.com"
                    className="mt-1.5"
                  />
                </div>
              </div>

              <div>
                <Label className="flex items-center justify-between">
                  <span>Your Google Review Link</span>
                  {googleReviewUrl && (
                    <a href={googleReviewUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary flex items-center gap-1 hover:underline">
                      Preview <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </Label>
                <Input
                  value={googleReviewUrl}
                  onChange={e => setGoogleReviewUrl(e.target.value)}
                  placeholder="https://g.page/r/..."
                  className="mt-1.5"
                />
                {!googleReviewUrl && (
                  <p className="text-xs text-muted-foreground mt-1">Add your Google review URL in your <strong>Profile settings</strong> to pre-fill this automatically.</p>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <Label>Email Message</Label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={generateEmail}
                    disabled={generating || !clientName}
                    className="h-7 text-xs"
                  >
                    {generating ? '✨ Writing...' : '✨ AI Generate'}
                  </Button>
                </div>
                <Textarea
                  value={emailBody}
                  onChange={e => setEmailBody(e.target.value)}
                  placeholder={generating ? 'Generating personalized email...' : "Click 'AI Generate' or write your message here..."}
                  className="mt-1 resize-none h-40 text-sm"
                />
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button variant="ghost" onClick={onClose} className="gap-1.5">
                <X className="w-3.5 h-3.5" /> Skip for now
              </Button>
              <Button
                onClick={handleSend}
                disabled={sending || !clientEmail || !emailBody}
                className="gap-2"
              >
                <Send className="w-4 h-4" />
                {sending ? 'Sending...' : 'Send Email'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}