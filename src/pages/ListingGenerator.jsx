import React, { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Wand2, Copy, Check, Loader2, RotateCcw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

const toneOptions = [
  { value: 'professional', label: '🏢 Professional & Formal' },
  { value: 'warm', label: '🏡 Warm & Inviting' },
  { value: 'luxury', label: '✨ Luxury & Upscale' },
  { value: 'energetic', label: '⚡ Energetic & Exciting' },
  { value: 'family', label: '👨‍👩‍👧 Family-Friendly' },
];

const lengthOptions = [
  { value: 'short', label: 'Short (100–150 words)' },
  { value: 'medium', label: 'Medium (200–250 words)' },
  { value: 'long', label: 'Long (300–350 words)' },
];

export default function ListingGenerator() {
  const { user } = useOutletContext();
  const [form, setForm] = useState({
    address: '',
    bedrooms: '',
    bathrooms: '',
    sqft: '',
    price: '',
    propertyType: '',
    highlights: '',
    tone: 'warm',
    length: 'medium',
  });
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleGenerate = async () => {
    setLoading(true);
    setResult('');

    const prompt = `You are an expert real estate copywriter. Write a polished, compelling MLS listing description for the following property.

Property Details:
- Address: ${form.address || 'Not specified'}
- Type: ${form.propertyType || 'Not specified'}
- Bedrooms: ${form.bedrooms || 'Not specified'}
- Bathrooms: ${form.bathrooms || 'Not specified'}
- Square Footage: ${form.sqft ? `${form.sqft} sq ft` : 'Not specified'}
- Price: ${form.price ? `$${form.price}` : 'Not specified'}
- Key Highlights & Features: ${form.highlights || 'Not specified'}

Instructions:
- Tone: ${toneOptions.find(t => t.value === form.tone)?.label}
- Length: ${lengthOptions.find(l => l.value === form.length)?.label}
- Write in third person, avoid using "I" or "we"
- Do NOT include the price in the description
- Start with an attention-grabbing opening line
- Highlight the most compelling features naturally
- End with a strong call to action
- Return ONLY the listing description text, no labels or headers`;

    const description = await base44.integrations.Core.InvokeLLM({ prompt });
    setResult(description);
    setLoading(false);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleReset = () => {
    setForm({
      address: '',
      bedrooms: '',
      bathrooms: '',
      sqft: '',
      price: '',
      propertyType: '',
      highlights: '',
      tone: 'warm',
      length: 'medium',
    });
    setResult('');
  };

  const isReady = form.highlights.trim().length > 10;

  return (
    <div className="p-6 lg:p-10 max-w-6xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
            <Wand2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-foreground tracking-tight">AI Listing Generator</h1>
            <p className="text-muted-foreground text-sm">Paste property details, get a polished MLS description instantly</p>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left — Input Form */}
        <div className="space-y-5">
          <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
            <h2 className="font-semibold text-foreground text-sm uppercase tracking-wide text-muted-foreground">Property Details</h2>

            <div>
              <Label className="text-sm">Address</Label>
              <Input
                value={form.address}
                onChange={e => setForm({ ...form, address: e.target.value })}
                placeholder="123 Main St, City, State"
                className="mt-1.5"
              />
            </div>

            <div>
              <Label className="text-sm">Property Type</Label>
              <Select value={form.propertyType} onValueChange={v => setForm({ ...form, propertyType: v })}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Single Family Home">Single Family Home</SelectItem>
                  <SelectItem value="Condo">Condo</SelectItem>
                  <SelectItem value="Townhouse">Townhouse</SelectItem>
                  <SelectItem value="Multi-Family">Multi-Family</SelectItem>
                  <SelectItem value="Land">Land</SelectItem>
                  <SelectItem value="Commercial">Commercial</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-sm">Beds</Label>
                <Input
                  type="number"
                  value={form.bedrooms}
                  onChange={e => setForm({ ...form, bedrooms: e.target.value })}
                  placeholder="3"
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label className="text-sm">Baths</Label>
                <Input
                  type="number"
                  value={form.bathrooms}
                  onChange={e => setForm({ ...form, bathrooms: e.target.value })}
                  placeholder="2"
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label className="text-sm">Sq Ft</Label>
                <Input
                  type="number"
                  value={form.sqft}
                  onChange={e => setForm({ ...form, sqft: e.target.value })}
                  placeholder="1800"
                  className="mt-1.5"
                />
              </div>
            </div>

            <div>
              <Label className="text-sm">Asking Price</Label>
              <Input
                value={form.price}
                onChange={e => setForm({ ...form, price: e.target.value })}
                placeholder="450,000"
                className="mt-1.5"
              />
            </div>

            <div>
              <Label className="text-sm">Key Features & Highlights <span className="text-destructive">*</span></Label>
              <Textarea
                value={form.highlights}
                onChange={e => setForm({ ...form, highlights: e.target.value })}
                placeholder="e.g. Updated kitchen with quartz counters, hardwood floors throughout, master suite with walk-in closet, backyard pool, 2-car garage, close to top-rated schools..."
                className="mt-1.5 min-h-[120px]"
              />
              <p className="text-xs text-muted-foreground mt-1">The more detail you provide, the better the result</p>
            </div>
          </div>

          <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
            <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Style Options</h2>
            <div>
              <Label className="text-sm">Tone</Label>
              <Select value={form.tone} onValueChange={v => setForm({ ...form, tone: v })}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {toneOptions.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm">Description Length</Label>
              <Select value={form.length} onValueChange={v => setForm({ ...form, length: v })}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {lengthOptions.map(l => (
                    <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button
            onClick={handleGenerate}
            disabled={!isReady || loading}
            className="w-full h-12 gap-2 rounded-xl text-sm font-semibold"
          >
            {loading ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Generating...</>
            ) : (
              <><Wand2 className="w-4 h-4" /> Generate Description</>
            )}
          </Button>
        </div>

        {/* Right — Output */}
        <div className="flex flex-col">
          <div className={cn(
            'flex-1 bg-card border border-border rounded-2xl p-6 flex flex-col min-h-[400px] transition-all',
            result && 'border-primary/30'
          )}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Generated Description</h2>
              {result && (
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={handleReset} className="gap-1 text-xs h-8 rounded-lg">
                    <RotateCcw className="w-3.5 h-3.5" /> Reset
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleCopy} className="gap-1 text-xs h-8 rounded-lg">
                    {copied ? <><Check className="w-3.5 h-3.5 text-green-500" /> Copied!</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}
                  </Button>
                </div>
              )}
            </div>

            <AnimatePresence mode="wait">
              {loading ? (
                <motion.div
                  key="loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground"
                >
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
                    <Wand2 className="w-6 h-6 text-primary animate-pulse" />
                  </div>
                  <p className="text-sm">Crafting your listing description...</p>
                </motion.div>
              ) : result ? (
                <motion.div
                  key="result"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex-1"
                >
                  <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{result}</p>
                  <div className="mt-4 pt-4 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
                    <span>{result.split(/\s+/).length} words</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleGenerate}
                      className="gap-1 h-7 text-xs rounded-lg"
                    >
                      <RotateCcw className="w-3 h-3" /> Regenerate
                    </Button>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex-1 flex flex-col items-center justify-center gap-3 text-center"
                >
                  <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
                    <Wand2 className="w-8 h-8 text-muted-foreground/30" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground text-sm">Your description will appear here</p>
                    <p className="text-xs text-muted-foreground mt-1">Fill in the property details and click Generate</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}