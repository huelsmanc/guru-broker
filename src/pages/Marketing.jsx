import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useOutletContext, useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Sparkles, Loader2, Search, Upload, Download, Printer, Copy, Save, Mail, Wand2, ImagePlus, X, Star, Trash2, Palette, Check, Send } from 'lucide-react';
import { format as fmtDate } from 'date-fns';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { isAdminRole } from '../../shared/permissions.generated.js';
import { renderImage } from '@/lib/inlineImages';
import Design, { FORMATS, TEMPLATES, KINDS, emailHtml } from '@/components/marketing/Design';
import { EditorThumb } from '@/components/print/EditorPage';

const STYLES = ['Modern', 'Luxury', 'Classic', 'Bold', 'Minimal', 'Coastal', 'Farmhouse', 'Playful'];
const loadHtmlToImage = () => import(/* @vite-ignore */ 'https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/+esm');

export function useBrand(user, brokerageId) {
  const { data: settings } = useQuery({
    queryKey: ['brokerage-settings', brokerageId],
    queryFn: async () => (await base44.entities.BrokerageSettings.filter({ brokerage_id: brokerageId }))[0] || null,
    enabled: !!brokerageId,
  });
  const agent = {
    name: user?.display_name || user?.full_name || '',
    title: user?.marketing_title ?? 'Real Estate Agent',
    phone: user?.phone || '',
    email: user?.email || '',
    license: user?.license_number || '',
    headshot: user?.headshot || '',
  };
  const brand = {
    logo: user?.marketing_logo_url || settings?.logo_url || '',
    brokerage: settings?.brokerage_name || '',
    color: user?.brand_color || settings?.primary_color || '',
  };
  return { agent, brand, settings };
}

export default function Marketing() {
  const { user, brokerageId } = useOutletContext();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'create';
  const [me, setMe] = useState(user);
  useEffect(() => setMe(user), [user]);
  const { agent, brand } = useBrand(me, brokerageId);
  const [loaded, setLoaded] = useState(null);
  // Opened from a deal ("Create just sold post"): start with that property.
  useEffect(() => {
    const txId = params.get('tx'); if (!txId) return;
    base44.entities.Transaction.get(txId).then((t) => {
      const [street, city, rest] = String(t.property_address || '').split(',').map((x) => x.trim());
      const [state, zip] = String(rest || '').split(' ');
      setLoaded({ kind: params.get('kind') || (t.status === 'closed' ? 'just_sold' : 'under_contract'), format: 'post',
        data: { listing: { street_address: street, city, state, zip, price: t.sale_price, transaction_id: t.id, mls_number: t.mls_number }, photos: [] } });
      setParams({ tab: 'create' });
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="p-4 md:p-8 max-w-[1400px] mx-auto">
      <div className="flex flex-wrap items-end gap-3 mb-6">
        <div className="flex-1">
          <h1 className="text-2xl font-bold flex items-center gap-2"><Sparkles className="w-6 h-6 text-primary" /> Marketing</h1>
          <p className="text-sm text-muted-foreground">Describe what you want. AI writes it and picks the look; your photos, prices, logo and contact info are placed exactly.</p>
        </div>
        <div className="flex rounded-full border p-1 text-sm">
          {[['create', 'Create'], ['kits', 'Listing kits'], ['designs', 'My designs'], ['brand', 'Brand kit']].map(([k, l]) => (
            <button key={k} onClick={() => setParams({ tab: k })} className={cn('px-4 py-1.5 rounded-full', tab === k ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}>{l}</button>
          ))}
        </div>
      </div>
      {tab === 'create' && <Studio key={loaded ? JSON.stringify(loaded).length + (loaded.id || '') : 'new'} user={me} brokerageId={brokerageId} agent={agent} brand={brand} initial={loaded} onNeedBrand={() => setParams({ tab: 'brand' })} />}
      {tab === 'kits' && <Kits user={me} brokerageId={brokerageId} agent={agent} brand={brand} onOpen={(d) => { setLoaded(d); setParams({ tab: 'create' }); }} />}
      {tab === 'designs' && <Gallery user={me} brokerageId={brokerageId} agent={agent} brand={brand} onOpen={(d) => { setLoaded(d); setParams({ tab: 'create' }); }} />}
      {tab === 'brand' && <BrandKit user={me} onSaved={setMe} agent={agent} brand={brand} />}
    </div>
  );
}

function Studio({ user, brokerageId, agent, brand, initial, onNeedBrand }) {
  const queryClient = useQueryClient();
  const [kind, setKind] = useState(initial?.kind || 'just_listed');
  const [listing, setListing] = useState(initial?.data?.listing || {});
  const [photos, setPhotos] = useState(initial?.data?.photos || []);
  const [prompt, setPrompt] = useState(initial?.data?.prompt || '');
  const [style, setStyle] = useState(initial?.data?.style || '');
  const [content, setContent] = useState(initial?.data?.content || null);
  const [bgImage, setBgImage] = useState(initial?.data?.bgImage || '');
  const [format, setFormat] = useState(initial?.format || 'flyer');
  const [designId, setDesignId] = useState(initial?.id || null);
  const [busy, setBusy] = useState(null);
  const [tweak, setTweak] = useState('');
  const [msg, setMsg] = useState('');
  const exportRef = useRef(null);
  const savedId = useRef(initial?.id || null);
  const navigate = useNavigate();
  const orderPrints = async () => { await save(); if (savedId.current) navigate(`/Marketing?tool=print&design=${savedId.current}`); };
  const previewBox = useRef(null);
  const [boxW, setBoxW] = useState(600);

  useEffect(() => {
    const el = previewBox.current; if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setBoxW(e.contentRect.width)); ro.observe(el); return () => ro.disconnect();
  }, [content]);

  const run = async (label, fn) => { setBusy(label); setMsg(''); try { await fn(); } catch (err) { window.alert(err.message); } finally { setBusy(null); } };
  const generate = () => run('generate', async () => {
    const { data } = await base44.functions.invoke('marketingAI', { kind, prompt, style, listing, brandColor: brand.color });
    setContent(data.content);
  });
  const applyTweak = () => tweak.trim() && run('tweak', async () => {
    const { data } = await base44.functions.invoke('marketingAI', { previous: content, instruction: tweak, listing });
    setContent(data.content); setTweak('');
  });
  const aiBackground = () => run('image', async () => {
    const idea = content?.image_idea || `${style || 'Modern'} ${KINDS[kind]} real estate scene${listing.city ? ` in ${listing.city}` : ''}`;
    const shape = FORMATS[format].h > FORMATS[format].w * 1.2 ? 'portrait' : FORMATS[format].w > FORMATS[format].h * 1.4 ? 'landscape' : 'square';
    const { data } = await base44.functions.invoke('marketingImage', { prompt: idea, shape });
    setBgImage(data.url);
  });

  const exportPng = () => run('png', async () => {
    const { toPng } = await loadHtmlToImage();
    const node = exportRef.current.firstElementChild;
    const url = await renderImage(toPng, node, { pixelRatio: format === 'flyer' ? 2 : 1 });
    const a = Object.assign(document.createElement('a'), { href: url, download: `${(content?.headline || 'design').replace(/[^\w ]+/g, '').slice(0, 40)}-${format}.png` });
    a.click();
  });
  const print = () => {
    const html = exportRef.current.innerHTML;
    const w = window.open('', '_blank');
    if (!w) return window.alert('Allow pop-ups to print.');
    w.document.write(`<!doctype html><html><head><title>${content?.headline || 'Flyer'}</title><link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700;800;900&family=Playfair+Display:wght@500;600;700&display=swap" rel="stylesheet"><style>@page{size:${format === 'flyer' ? 'letter' : 'auto'};margin:0}html,body{margin:0}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}</style></head><body>${html}<script>Promise.all([document.fonts.ready,...[...document.images].map(i=>i.complete?1:new Promise(r=>{i.onload=i.onerror=r}))]).then(()=>setTimeout(()=>window.print(),150))<\/script></body></html>`);
    w.document.close();
  };
  const copyCaption = async () => { await navigator.clipboard.writeText(`${content.social_caption}\n\n${(content.hashtags || []).map((h) => `#${h}`).join(' ')}`); setMsg('Caption copied'); };
  const copyEmail = async () => {
    const html = emailHtml({ content, listing, photos, agent, brand });
    try { await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([content.body], { type: 'text/plain' }) })]); setMsg('Email copied. Paste it into Gmail or Outlook.'); }
    catch { const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([html], { type: 'text/html' })), download: 'email.html' }); a.click(); }
  };
  const save = () => run('save', async () => {
    let thumb = '';
    try {
      const { toJpeg } = await loadHtmlToImage();
      const dataUrl = await renderImage(toJpeg, exportRef.current.firstElementChild, { pixelRatio: 0.35, quality: 0.8 });
      const blob = await (await fetch(dataUrl)).blob();
      thumb = (await base44.integrations.Core.UploadFile({ file: new File([blob], 'thumb.jpg', { type: 'image/jpeg' }) })).file_url;
    } catch { /* thumbnail optional */ }
    const rec = { brokerage_id: brokerageId, owner_email: String(user.email).toLowerCase(), title: content?.headline || KINDS[kind], kind, format, template: content?.template, thumbnail_url: thumb || undefined,
      listing_id: listing.id || null, data: { listing, photos, prompt, style, content, bgImage } };
    const saved = designId ? await base44.entities.MarketingDesign.update(designId, rec) : await base44.entities.MarketingDesign.create(rec);
    setDesignId(saved.id); savedId.current = saved.id; setMsg('Saved to My designs');
    queryClient.invalidateQueries({ queryKey: ['designs'] });
  });

  const setC = (k, v) => setContent((c) => ({ ...c, [k]: v }));
  const missingBrand = !agent.headshot || !brand.logo || !agent.phone;
  const previewScale = Math.min(1, (boxW - 8) / FORMATS[format].w, 760 / FORMATS[format].h);

  return (
    <div className="grid lg:grid-cols-[380px_1fr] gap-6">
      <div className="space-y-5">
        {missingBrand && <button onClick={onNeedBrand} className="w-full text-left rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm">Add your {[!agent.headshot && 'headshot', !brand.logo && 'logo', !agent.phone && 'phone'].filter(Boolean).join(', ')} in <b>Brand kit</b> so every design has them.</button>}
        <section>
          <Label>What are you making?</Label>
          <div className="flex flex-wrap gap-1.5 mt-2">{Object.entries(KINDS).map(([k, l]) => <button key={k} onClick={() => setKind(k)} className={cn('rounded-full border px-3 py-1 text-sm', kind === k ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted')}>{l}</button>)}</div>
        </section>
        {!['agent_intro', 'recruiting'].includes(kind) && <PropertyPicker user={user} listing={listing} setListing={setListing} photos={photos} setPhotos={setPhotos} />}
        <section>
          <Label>Describe what you want</Label>
          <Textarea className="mt-2" rows={4} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={kind === 'open_house' ? 'Open house Saturday 1-3pm. Highlight the new kitchen and big backyard. Upscale but warm.' : 'Luxury feel, mention the renovated kitchen and the pool, short and punchy.'} />
          <div className="flex flex-wrap gap-1.5 mt-2">{STYLES.map((s) => <button key={s} onClick={() => setStyle(style === s ? '' : s)} className={cn('rounded-full border px-2.5 py-0.5 text-xs', style === s ? 'bg-foreground text-background' : 'hover:bg-muted')}>{s}</button>)}</div>
        </section>
        <Button className="w-full gap-2 h-11" onClick={generate} disabled={!!busy}>{busy === 'generate' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} {content ? 'Start over with AI' : 'Create with AI'}</Button>

        {content && (
          <section className="rounded-xl border p-4 space-y-3">
            <p className="text-sm font-semibold flex items-center gap-1.5"><Wand2 className="w-4 h-4" /> Edit</p>
            <div className="flex gap-2">
              <Input placeholder="e.g. make it more modern, add open house Sun 12-2" value={tweak} onChange={(e) => setTweak(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && applyTweak()} />
              <Button size="icon" onClick={applyTweak} disabled={!!busy || !tweak.trim()}>{busy === 'tweak' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}</Button>
            </div>
            {[['ribbon', 'Label'], ['headline', 'Headline'], ['subheadline', 'Subheadline'], ['event_line', 'Open house / event'], ['cta', 'Call to action']].map(([k, l]) => (
              <div key={k}><Label className="text-xs">{l}</Label><Input className="mt-1 h-8 text-sm" value={content[k] || ''} onChange={(e) => setC(k, e.target.value)} /></div>
            ))}
            <div><Label className="text-xs">Description</Label><Textarea className="mt-1 text-sm" rows={3} value={content.body || ''} onChange={(e) => setC('body', e.target.value)} /></div>
            <div><Label className="text-xs">Highlights (one per line)</Label><Textarea className="mt-1 text-sm" rows={3} value={(content.bullets || []).join('\n')} onChange={(e) => setC('bullets', e.target.value.split('\n').slice(0, 5))} /></div>
            <div className="flex items-center gap-3 flex-wrap">
              <Palette className="w-4 h-4 text-muted-foreground" />
              {['primary', 'accent', 'background', 'text'].map((k) => (
                <label key={k} className="flex items-center gap-1 text-xs capitalize"><input type="color" value={content.palette?.[k] || '#000000'} onChange={(e) => setC('palette', { ...content.palette, [k]: e.target.value })} className="w-7 h-7 rounded border p-0" />{k}</label>
              ))}
            </div>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={aiBackground} disabled={!!busy}>{busy === 'image' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />} {bgImage ? 'New AI background' : 'AI background image'}</Button>
            {bgImage && <button className="text-xs text-muted-foreground underline ml-2" onClick={() => setBgImage('')}>remove</button>}
          </section>
        )}
      </div>

      <div className="min-w-0">
        {!content ? (
          <div className="h-full min-h-[420px] rounded-2xl border border-dashed flex flex-col items-center justify-center text-center p-8 text-muted-foreground">
            <Sparkles className="w-10 h-10 mb-3 opacity-40" />
            <p className="font-medium text-foreground">Your design shows up here</p>
            <p className="text-sm max-w-sm mt-1">Pick what you're making, choose the property, describe the vibe and hit Create. You'll get a print flyer, Instagram and Facebook sizes, and an email.</p>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <div className="flex rounded-lg border p-0.5 text-xs">{Object.entries(FORMATS).map(([k, f]) => <button key={k} onClick={() => setFormat(k)} className={cn('px-2.5 py-1.5 rounded-md', format === k ? 'bg-muted font-semibold' : '')}>{f.label}</button>)}</div>
              <select className="rounded-lg border bg-background px-2 py-1.5 text-xs" value={content.template} onChange={(e) => setC('template', e.target.value)}>{Object.entries(TEMPLATES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            </div>
            <div ref={previewBox} className="rounded-2xl bg-muted/50 p-4 flex justify-center overflow-hidden">
              <div className="shadow-2xl"><Design format={format} content={content} listing={listing} photos={photos} agent={agent} brand={brand} bgImage={bgImage} scale={previewScale} /></div>
            </div>
            <div className="flex flex-wrap gap-2 mt-4">
              <Button onClick={exportPng} disabled={!!busy} className="gap-1.5">{busy === 'png' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Download image</Button>
              {FORMATS[format].print && <Button variant="outline" onClick={print} className="gap-1.5"><Printer className="w-4 h-4" /> Print / PDF</Button>}
              <Button variant="outline" onClick={copyCaption} className="gap-1.5"><Copy className="w-4 h-4" /> Copy caption</Button>
              <Button variant="outline" onClick={copyEmail} className="gap-1.5"><Mail className="w-4 h-4" /> Copy as email</Button>
              <Button variant="outline" onClick={save} disabled={!!busy} className="gap-1.5">{busy === 'save' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save</Button>
              <Button variant="outline" onClick={orderPrints} disabled={!!busy} className="gap-1.5 border-primary/40 text-primary"><Mail className="w-4 h-4" /> Mail or print it</Button>
              {msg && <span className="text-sm text-emerald-700 flex items-center gap-1"><Check className="w-4 h-4" />{msg}</span>}
            </div>
            <div className="mt-4 rounded-xl border p-4 text-sm">
              <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">Social caption</p>
              <p className="whitespace-pre-wrap">{content.social_caption}</p>
              <p className="text-primary mt-1">{(content.hashtags || []).map((h) => `#${h}`).join(' ')}</p>
              <p className="text-xs text-muted-foreground mt-3">Check every fact before posting. Use MLS photos only for your own listings or with the listing agent's permission.</p>
            </div>
            {/* Full-size copy used for downloads and printing */}
            <div ref={exportRef} aria-hidden style={{ position: 'fixed', left: -20000, top: 0, pointerEvents: 'none' }}>
              <Design format={format} content={content} listing={listing} photos={photos} agent={agent} brand={brand} bgImage={bgImage} scale={1} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function PropertyPicker({ user, listing, setListing, photos, setPhotos }) {
  const [mode, setMode] = useState(listing.id ? 'mls' : 'mls');
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const { data: txs = [] } = useQuery({
    queryKey: ['my-tx-marketing', user?.email],
    queryFn: () => base44.entities.Transaction.filter({ brokerage_id: user.brokerage_id }, '-created_date', 100),
    enabled: mode === 'deal' && !!user,
  });
  useEffect(() => {
    if (mode !== 'mls' || q.trim().length < 3) { setResults([]); return undefined; }
    const t = setTimeout(async () => { try { setResults((await base44.functions.invoke('mlsSearch', { q })).data.results || []); } catch { setResults([]); } }, 350);
    return () => clearTimeout(t);
  }, [q, mode]);
  const pick = async (r) => {
    setListing({ id: r.id, mls_number: r.mls_number, street_address: r.street_address, unit: r.unit, city: r.city, state: r.state, zip: r.zip, price: r.list_price || r.close_price, beds: r.beds, baths_total: r.baths_total, living_area: r.living_area, status: r.status });
    setResults([]); setQ('');
    setBusy(true);
    try {
      const full = (await base44.functions.invoke('mlsSearch', { mls_number: r.mls_number })).data.listing;
      if (full) setListing((l) => ({ ...l, lot_size_acres: full.lot_size_acres, year_built: full.year_built, garage_spaces: full.garage_spaces, public_remarks: full.public_remarks }));
      const ph = (await base44.functions.invoke('marketingAssets', { listing_id: r.id })).data.photos || [];
      setPhotos(ph);
    } catch { /* photos optional */ } finally { setBusy(false); }
  };
  const fromDeal = (id) => {
    const t = txs.find((x) => x.id === id); if (!t) return;
    const [street, city, rest] = String(t.property_address || '').split(',').map((s) => s.trim());
    const [state, zip] = String(rest || '').split(' ');
    setListing({ street_address: street, city, state, zip, price: t.sale_price, transaction_id: t.id });
  };
  const [upErr, setUpErr] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const upload = async (files) => {
    const list = [...(files || [])].filter((f) => f.type.startsWith('image/')).slice(0, 12);
    if (!list.length) return;
    setBusy(true); setUpErr('');
    try { for (const f of list) { const { file_url } = await base44.integrations.Core.UploadFile({ file: f }); setPhotos((p) => [...p, file_url]); } }
    catch (err) { setUpErr(`A photo didn't upload: ${err.message || 'try again'}`); }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = ''; }
  };
  const set = (k) => (e) => setListing((l) => ({ ...l, [k]: e.target.value }));
  return (
    <section className="space-y-2">
      <Label>Property</Label>
      <div className="flex rounded-lg border p-0.5 text-xs w-fit">{[['mls', 'From MLS'], ['deal', 'From a deal'], ['manual', 'Type it in']].map(([k, l]) => <button key={k} onClick={() => setMode(k)} className={cn('px-3 py-1 rounded-md', mode === k && 'bg-muted font-semibold')}>{l}</button>)}</div>
      {mode === 'mls' && (
        <div className="relative">
          <div className="flex items-center gap-2 rounded-md border px-2"><Search className="w-4 h-4 text-muted-foreground" /><input className="flex-1 py-2 text-sm bg-transparent outline-none" placeholder="Address or MLS #" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          {results.length > 0 && (
            <ul className="absolute z-20 mt-1 w-full rounded-md border bg-popover shadow-lg max-h-64 overflow-auto">
              {results.map((r) => <li key={r.id}><button onClick={() => pick(r)} className="w-full text-left px-3 py-2 text-sm hover:bg-muted"><span className="font-medium">{r.street_address}</span>, {r.city} <span className="text-xs text-muted-foreground">· {r.status} · ${Number(r.list_price || r.close_price || 0).toLocaleString()}</span></button></li>)}
            </ul>
          )}
        </div>
      )}
      {mode === 'deal' && (
        <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" onChange={(e) => fromDeal(e.target.value)} defaultValue="">
          <option value="">Choose a transaction</option>
          {txs.map((t) => <option key={t.id} value={t.id}>{t.property_address}</option>)}
        </select>
      )}
      <div className="grid grid-cols-6 gap-2">
        <Input className="col-span-6 h-8 text-sm" placeholder="Street address" value={listing.street_address || ''} onChange={set('street_address')} />
        <Input className="col-span-3 h-8 text-sm" placeholder="City" value={listing.city || ''} onChange={set('city')} />
        <Input className="col-span-1 h-8 text-sm" placeholder="ST" value={listing.state || ''} onChange={set('state')} />
        <Input className="col-span-2 h-8 text-sm" placeholder="Zip" value={listing.zip || ''} onChange={set('zip')} />
        <Input className="col-span-2 h-8 text-sm" placeholder="Price" inputMode="numeric" value={listing.price || ''} onChange={set('price')} />
        <Input className="col-span-1 h-8 text-sm" placeholder="Bd" value={listing.beds ?? ''} onChange={set('beds')} />
        <Input className="col-span-1 h-8 text-sm" placeholder="Ba" value={listing.baths_total ?? ''} onChange={set('baths_total')} />
        <Input className="col-span-2 h-8 text-sm" placeholder="Sq ft" value={listing.living_area ?? ''} onChange={set('living_area')} />
      </div>
      <div onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={(e) => { e.preventDefault(); setDragOver(false); upload(e.dataTransfer.files); }}>
        <div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">Photos {busy && <Loader2 className="inline w-3 h-3 animate-spin" />}{photos.length > 1 ? ' · the first one is the main photo' : ''}</span>
          {photos.length > 0 && <button className="text-xs text-primary flex items-center gap-1" onClick={() => fileRef.current?.click()}><Upload className="w-3 h-3" /> Add more</button>}</div>
        <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => upload(e.target.files)} />
        {photos.length === 0 && (
          <button type="button" onClick={() => fileRef.current?.click()} className={cn('mt-1.5 w-full rounded-lg border-2 border-dashed p-4 text-center text-sm hover:bg-muted/40', dragOver && 'border-primary bg-primary/5')}>
            <Upload className="w-5 h-5 mx-auto mb-1 text-muted-foreground" />
            <span className="font-medium">Upload photos of the house</span>
            <span className="block text-xs text-muted-foreground">Click to choose, or drag them here. Up to 12.</span>
          </button>
        )}
        {upErr && <p className="text-xs text-red-600 mt-1">{upErr}</p>}
        {photos.length > 0 && (
          <div className="grid grid-cols-4 gap-1.5 mt-1.5">
            {photos.map((p, i) => (
              <div key={p} className={cn('relative group aspect-[4/3] rounded overflow-hidden border-2', i === 0 ? 'border-primary' : 'border-transparent')}>
                <img src={p} alt="" className="w-full h-full object-cover" />
                <div className="absolute inset-0 hidden group-hover:flex items-center justify-center gap-1 bg-black/40">
                  {i > 0 && <button title="Make main photo" onClick={() => setPhotos([p, ...photos.filter((x) => x !== p)])} className="p-1 rounded bg-white/90"><Star className="w-3 h-3" /></button>}
                  <button title="Remove" onClick={() => setPhotos(photos.filter((x) => x !== p))} className="p-1 rounded bg-white/90"><X className="w-3 h-3" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

const KIT_KINDS = { just_listed: 'Just listed', under_contract: 'Under contract', just_sold: 'Just sold', open_house: 'Open house', price_reduced: 'Price improved', coming_soon: 'Coming soon' };
const KIT_FORMAT_LABEL = { postcard_4x6: 'Postcard', flyer: 'Flyer', post: 'Post', story: 'Story' };

// Ready-made sets (postcard, flyer, post, story) made when a deal goes under contract or closes,
// when the agent's own listing hits the MLS, or on request.
function Kits({ user, brokerageId, agent, brand, onOpen }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState('just_sold');
  const [dealId, setDealId] = useState('');
  const [tick, setTick] = useState(0);
  const { data: designs = [], isLoading } = useQuery({
    queryKey: ['kit-designs', brokerageId, user?.email, tick],
    queryFn: () => base44.entities.MarketingDesign.filter({ brokerage_id: brokerageId, owner_email: String(user.email).toLowerCase() }, '-created_date', 300),
    enabled: !!brokerageId && !!user,
  });
  const { data: deals = [] } = useQuery({
    queryKey: ['kit-deals', brokerageId, user?.email],
    queryFn: () => base44.entities.Transaction.filter({ brokerage_id: brokerageId, agent_email: String(user.email).toLowerCase() }, '-created_date', 100),
    enabled: !!brokerageId && !!user,
  });
  const kits = useMemo(() => {
    const m = new Map();
    for (const d of designs) { if (!d.kit_id) continue; if (!m.has(d.kit_id)) m.set(d.kit_id, { id: d.kit_id, title: d.kit_title || d.title, kind: d.kind, at: d.created_date, designs: [] }); m.get(d.kit_id).designs.push(d); }
    return [...m.values()];
  }, [designs]);
  const make = async () => {
    if (!dealId) return;
    setBusy(true);
    try { await base44.functions.invoke('listingKit', { action: 'make', kind, transaction_id: dealId, again: true }); setTick((t) => t + 1); }
    catch (err) { window.alert(err.message); } finally { setBusy(false); }
  };
  const copy = (d) => { const c = d.data?.content || {}; navigator.clipboard?.writeText(`${c.social_caption || ''}\n\n${(c.hashtags || []).map((h) => `#${h}`).join(' ')}`); };
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border bg-card p-4 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[240px]">
          <p className="font-semibold">Make a kit</p>
          <p className="text-sm text-muted-foreground">A postcard, flyer, social post and story, written for the moment and filled with the property's facts and MLS photos.</p>
        </div>
        <select value={kind} onChange={(e) => setKind(e.target.value)} className="rounded-lg border bg-background px-3 py-2 text-sm">{Object.entries(KIT_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <select value={dealId} onChange={(e) => setDealId(e.target.value)} className="rounded-lg border bg-background px-3 py-2 text-sm max-w-[260px]"><option value="">Pick one of your deals…</option>{deals.map((t) => <option key={t.id} value={t.id}>{t.property_address}</option>)}</select>
        <Button onClick={make} disabled={!dealId || busy} className="gap-1.5">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Make kit</Button>
      </div>
      <p className="text-xs text-muted-foreground -mt-3">Kits are also made for you automatically when a listing goes under contract, when any deal closes, and when your own new listing shows up in the MLS.</p>
      {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : !kits.length ? <p className="text-sm text-muted-foreground">No kits yet.</p> : kits.map((k) => {
        const postcard = k.designs.find((d) => d.format === 'postcard_4x6');
        const flyer = k.designs.find((d) => d.format === 'flyer');
        const post = k.designs.find((d) => d.format === 'post');
        return (
          <section key={k.id} className="rounded-2xl border bg-card p-4">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <div className="flex-1 min-w-[200px]"><p className="font-semibold">{k.title}</p><p className="text-xs text-muted-foreground">{KIT_KINDS[k.kind] || k.kind} · {fmtDate(new Date(k.at), 'MMM d')}</p></div>
              {postcard && <Button size="sm" className="gap-1" onClick={() => navigate(`/Marketing?tool=print&design=${postcard.id}&product=postcard_4x6`)}><Mail className="w-4 h-4" /> Mail postcards</Button>}
              {flyer && <Button size="sm" variant="outline" className="gap-1" onClick={() => navigate(`/Marketing?tool=print&design=${flyer.id}&product=flyer_letter`)}><Printer className="w-4 h-4" /> Order flyers</Button>}
              {post && <Button size="sm" variant="outline" className="gap-1" onClick={() => copy(post)}><Copy className="w-4 h-4" /> Copy caption</Button>}
            </div>
            <div className="flex gap-3 overflow-x-auto pb-1">
              {['postcard_4x6', 'flyer', 'post', 'story'].map((f) => k.designs.find((d) => d.format === f)).filter(Boolean).map((d) => {
                const F = FORMATS[d.format] || FORMATS.flyer; const h = 170; const sc = h / F.h;
                return (
                  <button key={d.id} onClick={() => onOpen(d)} className="flex-shrink-0 text-left group" title="Open to edit">
                    <div className="rounded-lg overflow-hidden ring-1 ring-black/10 group-hover:ring-primary" style={{ width: F.w * sc, height: h }}>
                      <div style={{ transform: `scale(${sc})`, transformOrigin: 'top left' }}><Design format={d.format} content={d.data?.content} listing={d.data?.listing} photos={d.data?.photos} agent={agent} brand={brand} bgImage={d.data?.bgImage} /></div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{KIT_FORMAT_LABEL[d.format] || d.format}</p>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function Gallery({ user, brokerageId, agent, brand, onOpen }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  // Print designs made in the editor open back in the editor.
  const open = (d) => (d.data?.editor ? navigate(`/Marketing?tool=print&design=${d.id}&product=${d.data.editor.product}&edit=1`) : onOpen(d));
  const admin = isAdminRole(user?.role);
  const [everyone, setEveryone] = useState(false);
  const { data: designs = [], isLoading } = useQuery({
    queryKey: ['designs', brokerageId, everyone, user?.email],
    queryFn: () => base44.entities.MarketingDesign.filter(everyone ? { brokerage_id: brokerageId } : { brokerage_id: brokerageId, owner_email: String(user.email).toLowerCase() }, '-updated_date', 200),
    enabled: !!brokerageId && !!user,
  });
  const del = async (d) => { if (!window.confirm(`Delete "${d.title}"?`)) return; await base44.entities.MarketingDesign.delete(d.id); queryClient.invalidateQueries({ queryKey: ['designs'] }); };
  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        {admin && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={everyone} onChange={(e) => setEveryone(e.target.checked)} /> Show everyone's designs</label>}
        <Button size="sm" variant="outline" className="gap-1.5 ml-auto" onClick={() => navigate('/Marketing?tool=print')}><Printer className="w-4 h-4" /> Design a postcard, flyer or card</Button>
      </div>
      {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : !designs.length ? <p className="text-sm text-muted-foreground">Nothing saved yet. Designs you save show up here.</p> : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {designs.map((d) => (
            <div key={d.id} className="group rounded-xl border overflow-hidden bg-card">
              <button onClick={() => open(d)} className="block w-full aspect-[4/5] bg-muted overflow-hidden">
                {d.data?.editor ? <div className="w-full h-full flex items-center justify-center p-2"><EditorThumb product={d.data.editor.product} page={d.data.editor.pages.front} height={d.data.editor.product === 'flyer_letter' ? 190 : d.data.editor.product === 'business_cards' ? 80 : 110} className="shadow ring-1 ring-black/10 bg-white" /></div>
                  : d.thumbnail_url ? <img src={d.thumbnail_url} alt="" className="w-full h-full object-cover object-top" />
                  : <div className="origin-top-left" style={{ transform: 'scale(0.22)' }}><Design format={d.format} content={d.data?.content} listing={d.data?.listing} photos={d.data?.photos} agent={agent} brand={brand} bgImage={d.data?.bgImage} /></div>}
              </button>
              <div className="p-2.5 flex items-start gap-2">
                <div className="flex-1 min-w-0"><p className="text-sm font-medium truncate">{d.title}</p><p className="text-xs text-muted-foreground">{d.data?.editor ? 'Print design' : KINDS[d.kind] || d.kind} · {fmtDate(new Date(d.updated_date || d.created_date), 'MMM d')}{everyone ? ` · ${d.owner_email}` : ''}</p></div>
                <button onClick={() => del(d)} className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Drag to move, slider to zoom; saves a 600x600 square so every design and avatar shows the same framing.
function HeadshotCropper({ src, onCancel, onDone }) {
  const BOX = 260;
  const [img, setImg] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [err, setErr] = useState('');
  const drag = useRef(null);
  useEffect(() => {
    const i = new Image(); i.crossOrigin = 'anonymous';
    i.onload = () => { setImg(i); setPos({ x: 0, y: 0 }); setZoom(1); };
    i.onerror = () => setErr("Couldn't open that photo. Upload it again.");
    i.src = src;
  }, [src]);
  const base = img ? BOX / Math.min(img.width, img.height) : 1; // cover the square at zoom 1
  const w = img ? img.width * base * zoom : 0; const h = img ? img.height * base * zoom : 0;
  const clamp = (p, z = zoom) => {
    if (!img) return p;
    const ww = img.width * base * z; const hh = img.height * base * z;
    return { x: Math.min(0, Math.max(BOX - ww, p.x)), y: Math.min(0, Math.max(BOX - hh, p.y)) };
  };
  useEffect(() => { if (img) setPos((p) => clamp(p.x === 0 && p.y === 0 ? { x: (BOX - w) / 2, y: (BOX - h) / 2 } : p)); }, [img]); // center first
  const onZoom = (z) => {
    const c = { x: BOX / 2, y: BOX / 2 }; const k = z / zoom;
    setPos(clamp({ x: c.x - (c.x - pos.x) * k, y: c.y - (c.y - pos.y) * k }, z)); setZoom(z);
  };
  const down = (e) => { drag.current = { sx: e.clientX, sy: e.clientY, x: pos.x, y: pos.y }; e.currentTarget.setPointerCapture?.(e.pointerId); };
  const move = (e) => { const d = drag.current; if (!d) return; setPos(clamp({ x: d.x + e.clientX - d.sx, y: d.y + e.clientY - d.sy })); };
  const done = async () => {
    try {
      const c = document.createElement('canvas'); c.width = 600; c.height = 600;
      const k = 600 / BOX;
      c.getContext('2d').drawImage(img, pos.x * k, pos.y * k, w * k, h * k);
      const blob = await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('no image'))), 'image/jpeg', 0.9));
      let original = null;
      if (src.startsWith('blob:')) original = new File([await (await fetch(src)).blob()], 'headshot-original.jpg', { type: 'image/jpeg' });
      onDone(blob, original);
    } catch { setErr("Couldn't save that framing. Upload the photo again, then reposition it."); }
  };
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="rounded-2xl bg-card p-5 shadow-xl space-y-4 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div><p className="font-semibold">Position your headshot</p><p className="text-sm text-muted-foreground">Drag to move. Use the slider to zoom.</p></div>
        <div className="mx-auto relative overflow-hidden rounded-full bg-muted touch-none cursor-grab active:cursor-grabbing select-none" style={{ width: BOX, height: BOX }}
          onPointerDown={down} onPointerMove={move} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
          {img && <img src={src} alt="" draggable={false} className="absolute max-w-none pointer-events-none" style={{ left: pos.x, top: pos.y, width: w, height: h }} />}
          {!img && !err && <Loader2 className="w-6 h-6 animate-spin absolute inset-0 m-auto" />}
        </div>
        <input type="range" min="1" max="4" step="0.01" value={zoom} onChange={(e) => onZoom(Number(e.target.value))} className="w-full" aria-label="Zoom" />
        {err && <p className="text-sm text-red-600">{err}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button onClick={done} disabled={!img}>Use this</Button>
        </div>
      </div>
    </div>
  );
}

const TITLES = ['Real Estate Agent', 'Real Estate Salesperson', 'REALTOR®', 'Associate Broker', 'Broker', 'Broker/Owner', ''];

function BrandKit({ user, onSaved, agent, brand }) {
  const [f, setF] = useState({ headshot: user?.headshot || '', marketing_logo_url: user?.marketing_logo_url || '', brand_color: user?.brand_color || '#0f172a', marketing_title: user?.marketing_title ?? 'Real Estate Agent', phone: user?.phone || '', license_number: user?.license_number || '' });
  const [busy, setBusy] = useState(null);
  const [crop, setCrop] = useState(null); // { src, revoke }
  const [note, setNote] = useState('');
  const up = (k) => async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    e.target.value = '';
    // Headshots: frame it first (drag and zoom), then upload the framed square.
    if (k === 'headshot') { const src = URL.createObjectURL(file); setCrop({ src, revoke: true }); return; }
    setBusy(k);
    try { const { file_url } = await base44.integrations.Core.UploadFile({ file }); setF((x) => ({ ...x, [k]: file_url })); } finally { setBusy(null); }
  };
  const save = async () => {
    setBusy('save');
    setNote('');
    try { const saved = await base44.entities.User.update(user.id, f); onSaved({ ...user, ...saved, ...f }); setNote('Saved. Every new design uses this now.'); }
    catch (err) { setNote(`Couldn't save: ${err.message}`); } finally { setBusy(null); }
  };
  const sample = useMemo(() => ({ template: 'hero', palette: { primary: f.brand_color, accent: '#c9a227', background: '#ffffff', text: '#111827' }, ribbon: 'JUST LISTED', headline: 'Your next design', body: '', bullets: [] }), [f.brand_color]);
  return (
    <div className="grid lg:grid-cols-[1fr_auto] gap-8 max-w-5xl">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">Set this once. Every flyer, post and email uses it.</p>
        <div className="flex items-center gap-4">
          {f.headshot ? <img src={f.headshot} alt="" className="w-20 h-20 rounded-full object-cover border" /> : <div className="w-20 h-20 rounded-full bg-muted" />}
          <label className="text-sm text-primary cursor-pointer flex items-center gap-1">{busy === 'headshot' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} {f.headshot ? 'New headshot' : 'Headshot'}<input type="file" accept="image/*" className="hidden" onChange={up('headshot')} /></label>
          {f.headshot && <button type="button" className="text-sm text-primary" onClick={() => setCrop({ src: user?.headshot_original || f.headshot })}>Reposition</button>}
        </div>
        {crop && (
          <HeadshotCropper src={crop.src} onCancel={() => { if (crop.revoke) URL.revokeObjectURL(crop.src); setCrop(null); }}
            onDone={async (blob, original) => {
              setBusy('headshot');
              try {
                const { file_url } = await base44.integrations.Core.UploadFile({ file: new File([blob], 'headshot.jpg', { type: 'image/jpeg' }) });
                let orig = user?.headshot_original || null;
                if (original) orig = (await base44.integrations.Core.UploadFile({ file: original })).file_url;
                setF((x) => ({ ...x, headshot: file_url, headshot_original: orig }));
              } catch (err) { window.alert(err.message || 'Upload failed'); }
              finally { setBusy(null); if (crop.revoke) URL.revokeObjectURL(crop.src); setCrop(null); }
            }} />
        )}
        <div className="flex items-center gap-4">
          {f.marketing_logo_url || brand.logo ? <img src={f.marketing_logo_url || brand.logo} alt="" className="h-14 max-w-[180px] object-contain border rounded p-1" /> : <div className="h-14 w-32 rounded bg-muted" />}
          <label className="text-sm text-primary cursor-pointer flex items-center gap-1">{busy === 'marketing_logo_url' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} {f.marketing_logo_url ? 'Change logo' : 'Use my own logo'}<input type="file" accept="image/*" className="hidden" onChange={up('marketing_logo_url')} /></label>
          {f.marketing_logo_url && <button className="text-xs text-muted-foreground underline" onClick={() => setF((x) => ({ ...x, marketing_logo_url: '' }))}>use brokerage logo</button>}
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div><Label>Title under your name</Label>
            {/* REALTOR® is only for NAR members, so it's a choice, not the default. */}
            <select className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={TITLES.includes(f.marketing_title) ? f.marketing_title : '__custom'}
              onChange={(e) => setF({ ...f, marketing_title: e.target.value === '__custom' ? (TITLES.includes(f.marketing_title) ? '' : f.marketing_title) : e.target.value })}>
              {TITLES.map((t) => <option key={t} value={t}>{t || 'No title'}</option>)}
              <option value="__custom">Something else…</option>
            </select>
            {!TITLES.includes(f.marketing_title) && <Input className="mt-2" placeholder="e.g. Licensed Real Estate Salesperson" value={f.marketing_title} onChange={(e) => setF({ ...f, marketing_title: e.target.value })} />}
          </div>
          <div><Label>Phone</Label><Input className="mt-1" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
          <div><Label>License #</Label><Input className="mt-1" value={f.license_number} onChange={(e) => setF({ ...f, license_number: e.target.value })} /></div>
          <div><Label>Brand color</Label><div className="flex gap-2 mt-1"><input type="color" value={f.brand_color} onChange={(e) => setF({ ...f, brand_color: e.target.value })} className="w-10 h-10 rounded border" /><Input value={f.brand_color} onChange={(e) => setF({ ...f, brand_color: e.target.value })} /></div></div>
        </div>
        <p className="text-xs text-muted-foreground">Your brokerage name ({brand.brokerage || 'set in Settings'}) and the Equal Housing Opportunity notice are added to every design automatically.</p>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={save} disabled={!!busy} className="gap-1.5">{busy === 'save' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save brand kit</Button>
          {note && <p className={cn('text-sm', note.startsWith('Saved') ? 'text-emerald-700' : 'text-red-600')}>{note}</p>}
        </div>
      </div>
      <div>
        <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">How it looks</p>
        <div className="rounded-lg overflow-hidden shadow-sm ring-1 ring-black/5 w-fit">
          <Design format="post" content={sample} agent={{ ...agent, headshot: f.headshot, phone: f.phone, license: f.license_number, title: f.marketing_title }} brand={{ ...brand, logo: f.marketing_logo_url || brand.logo }} scale={typeof window !== 'undefined' && window.innerWidth < 640 ? 0.28 : 0.33} />
        </div>
      </div>
    </div>
  );
}
