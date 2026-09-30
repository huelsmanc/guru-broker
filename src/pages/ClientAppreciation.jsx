import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Heart, Loader2, CheckCircle, AlertCircle, Mail } from 'lucide-react';
import { motion } from 'framer-motion';

export default function ClientAppreciation() {
  const { user, brokerageId } = useOutletContext();
  const [form, setForm] = useState({ clientName: '', propertyAddress: '', closedDate: '', clientType: 'buyer' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null);
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [clientEmail, setClientEmail] = useState('');
  const [brokerageSettings, setBrokerageSettings] = useState(null);

  React.useEffect(() => {
    if (brokerageId) {
      base44.entities.BrokerageSettings.filter({ brokerage_id: brokerageId }).then((results) => {
        if (results.length > 0) setBrokerageSettings(results[0]);
      });
    }
  }, [brokerageId]);

  const handleGenerateEmail = async () => {
    if (!form.clientName || !form.propertyAddress || !form.closedDate) {
      setError('Please fill in all fields');
      return;
    }

    if (!user?.full_name) {
      setError('User information not loaded');
      return;
    }

    setLoading(true);
    setError('');
    setPreview(null);

    try {
      // Generate unique review token
      const reviewToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      
      // Create pending review record
      const reviewRecord = await base44.entities.ClientReview.create({
        brokerage_id: brokerageId,
        agent_id: user.id,
        agent_name: user.full_name,
        agent_email: user.email,
        client_name: form.clientName,
        property_address: form.propertyAddress,
        review_token: reviewToken,
        status: 'pending'
      });

      const brokerage = brokerageSettings?.brokerage_name || 'our brokerage';
      const agentName = user.full_name;
      const reviewLink = `${window.location.origin}/review?token=${reviewToken}`;
      
      const prompt = `Generate a warm, personalized thank you email for a real estate ${form.clientType}. The agent's name is ${agentName} from ${brokerage}. 
      
Client name: ${form.clientName}
Property address: ${form.propertyAddress}
Closing date: ${form.closedDate}

Write a professional yet heartfelt thank you email in HTML format that:
1. Thanks them for trusting the agent with their transaction
2. Mentions the specific property
3. Expresses appreciation for the relationship
4. Invites them to reach out for future needs

Use HTML with <strong> tags to bold the client name, agent name, and brokerage name. Use <p> tags for paragraphs and add line breaks for readability. 

At the end of the email, include a call-to-action section with a button/link that says "Leave a Review" and links to: ${reviewLink}

Keep it to 3-4 paragraphs, warm and genuine tone.`;

      const response = await base44.integrations.Core.InvokeLLM({
        prompt,
        response_json_schema: {
          type: 'object',
          properties: {
            subject: { type: 'string' },
            body: { type: 'string' }
          }
        }
      });

      if (response?.subject && response?.body) {
        setPreview(response);
      } else {
        setError('No response from AI');
      }
    } catch (err) {
      console.error('Email generation error:', err);
      setError(err?.message || 'Failed to generate email');
    } finally {
      setLoading(false);
    }
  };

  const handleSendEmail = async () => {
    if (!preview?.body || !clientEmail.trim()) {
      setError('Please enter client email address');
      return;
    }

    setSending(true);
    setError('');

    try {
      await base44.integrations.Core.SendEmail({
        to: clientEmail,
        subject: preview.subject,
        body: `<html><body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">${preview.body}</body></html>`,
        from_name: `${user?.full_name} - ${brokerageSettings?.brokerage_name || 'Your Brokerage'}`
      });

      setSuccess(true);
      setForm({ clientName: '', propertyAddress: '', closedDate: '', clientType: 'buyer' });
      setPreview(null);
      setClientEmail('');
      setTimeout(() => setSuccess(false), 4000);
    } catch (err) {
      setError(err.message || 'Failed to send email');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="p-6 lg:p-10 max-w-3xl mx-auto">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Heart className="w-7 h-7 text-primary" />
          <h1 className="text-3xl font-bold text-foreground">Client Appreciation</h1>
        </div>
        <p className="text-muted-foreground">Send personalized thank you emails to your clients on behalf of you and your brokerage</p>
      </motion.div>

      {success && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6 flex items-center gap-3"
        >
          <CheckCircle className="w-5 h-5 text-green-600" />
          <p className="text-green-800 font-medium">Thank you email sent successfully!</p>
        </motion.div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Form */}
        <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}>
          <Card className="p-6 border-border/40">
            <h2 className="font-semibold text-foreground mb-4">Client Details</h2>
            <div className="space-y-4">
              <div>
                <Label className="text-sm">Client Name *</Label>
                <Input
                  value={form.clientName}
                  onChange={(e) => setForm({ ...form, clientName: e.target.value })}
                  placeholder="e.g. Sarah Johnson"
                  className="mt-1.5"
                />
              </div>

              <div>
                <Label className="text-sm">Property Address *</Label>
                <Input
                  value={form.propertyAddress}
                  onChange={(e) => setForm({ ...form, propertyAddress: e.target.value })}
                  placeholder="e.g. 123 Main St, New York, NY 10001"
                  className="mt-1.5"
                />
              </div>

              <div>
                <Label className="text-sm">Closing Date *</Label>
                <Input
                  type="date"
                  value={form.closedDate}
                  onChange={(e) => setForm({ ...form, closedDate: e.target.value })}
                  className="mt-1.5"
                />
              </div>

              <div>
                <Label className="text-sm">Client Type *</Label>
                <select
                  value={form.clientType}
                  onChange={(e) => setForm({ ...form, clientType: e.target.value })}
                  className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="buyer">Buyer</option>
                  <option value="seller">Seller</option>
                </select>
              </div>

              {error && (
                <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 flex gap-2">
                  <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-destructive">{error}</p>
                </div>
              )}

              <Button
                onClick={handleGenerateEmail}
                disabled={loading || !form.clientName || !form.propertyAddress || !form.closedDate}
                className="w-full rounded-xl h-11 gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Generating Email...
                  </>
                ) : (
                  <>
                    <Heart className="w-4 h-4" />
                    Generate Thank You Email
                  </>
                )}
              </Button>
            </div>
          </Card>
        </motion.div>

        {/* Preview */}
        <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}>
          {preview ? (
            <Card className="p-6 border-border/40 bg-muted/30 space-y-4">
              <div>
                <p className="text-xs text-muted-foreground font-semibold mb-1">SUBJECT</p>
                <p className="font-semibold text-foreground">{preview.subject}</p>
              </div>

              <div className="border-t border-border pt-4">
                <p className="text-xs text-muted-foreground font-semibold mb-3">PREVIEW</p>
                <div className="bg-white dark:bg-card rounded-lg p-4 text-sm text-foreground leading-relaxed max-h-48 overflow-y-auto prose prose-sm dark:prose-invert max-w-none [&_strong]:font-bold [&_strong]:text-foreground [&_p]:mb-3 [&_p:last-child]:mb-0">
                  <div dangerouslySetInnerHTML={{ __html: preview.body }} />
                </div>
              </div>

              <div className="border-t border-border pt-4">
                <Label className="text-sm">Client Email</Label>
                <Input
                  type="email"
                  value={clientEmail}
                  onChange={(e) => setClientEmail(e.target.value)}
                  placeholder="client@example.com"
                  className="mt-1.5"
                />
              </div>

              <Button
                onClick={handleSendEmail}
                disabled={sending || !clientEmail.trim()}
                className="w-full rounded-xl h-11 gap-2 bg-primary hover:bg-primary/90"
              >
                {sending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                   <>
                     <Mail className="w-4 h-4" />
                     Send Email
                   </>
                )}
              </Button>
            </Card>
          ) : (
            <Card className="p-6 border-border/40 text-center flex items-center justify-center h-96">
              <div>
                <Heart className="w-12 h-12 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-muted-foreground">Email preview will appear here</p>
              </div>
            </Card>
          )}
        </motion.div>
      </div>
    </div>
  );
}