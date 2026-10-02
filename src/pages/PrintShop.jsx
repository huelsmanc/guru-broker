import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Mail, Printer, CreditCard, Package, Upload, Users, Check, X, AlertTriangle, ExternalLink, Trash2, ShieldCheck, ArrowLeft, Settings as SettingsIcon, ListChecks, Truck, Pencil, Wand2, RotateCcw, Save } from 'lucide-react';
import { format as fmtDate } from 'date-fns';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { isAdminRole } from '../../shared/permissions.generated.js';
import Design from '@/components/marketing/Design';
import { PostcardBack, UploadedArt } from '@/components/print/PrintPieces';
import EditorPage, { EditorThumb } from '@/components/print/EditorPage';
import PrintEditor from '@/components/print/PrintEditor';
import { newDoc, resizeDoc, sameShape, emptySpots, refreshBrand } from '@/lib/editorDoc';
import { openPdf, pageImage } from '@/lib/pdfText';
import { useBrand } from '@/pages/Marketing';
import { drawTrim, addBleed, toBlob, makePdf, uploadPrintFile } from '@/lib/printFiles';
import { PRODUCTS, priceFor, money, parseAddressCsv, splitAddress, cleanAddress } from '../../shared/print.js';

// Whole sentences that fit, so the message never stops mid-word.
const fitSentences = (text, max) => {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  return end > 60 ? cut.slice(0, end + 1) : cut.slice(0, cut.lastIndexOf(' ')).replace(/[,;:\s]+$/, '') + '…';
};
const shop = (action, body = {}) => base44.functions.invoke('printShop', { action, ...body }).then((r) => r.data);
const ICON = { postcard_4x6: Mail, postcard_6x9: Mail, flyer_letter: Printer, business_cards: CreditCard };
const STATUS = {
  awaiting_payment: ['Waiting for payment', 'bg-amber-100 text-amber-800'], paid: ['Paid', 'bg-blue-100 text-blue-800'],
  mailing: ['Mailing', 'bg-blue-100 text-blue-800'], mailed: ['Mailed', 'bg-emerald-100 text-emerald-800'],
  in_production: ['Printing', 'bg-blue-100 text-blue-800'], shipped: ['Shipped', 'bg-emerald-100 text-emerald-800'],
  delivered: ['Delivered', 'bg-emerald-100 text-emerald-800'], needs_attention: ['Needs attention', 'bg-red-100 text-red-700'],
  failed: ['Failed', 'bg-red-100 text-red-700'], cancelled: ['Cancelled', 'bg-slate-100 text-slate-500'],
};

export default function PrintShop() {
  const { user, brokerageId } = useOutletContext();
  const [params, setParams] = useSearchParams();
  const view = params.get('view') || 'order';
  const go = (v, extra = {}) => setParams({ tool: 'print', ...(v === 'order' ? {} : { view: v }), ...extra }, { replace: true });
  const { data: catalog, refetch } = useQuery({ queryKey: ['print-catalog'], queryFn: () => shop('catalog') });
  const [banner, setBanner] = useState(null);

  // Back from Stripe: confirm the payment right away (the webhook does it too).
  useEffect(() => {
    const orderId = params.get('order');
    if (!orderId) return;
    if (params.get('cancelled')) { setBanner({ tone: 'warn', text: 'Payment cancelled. Your order was not placed.' }); shop('cancel', { order_id: orderId }).catch(() => {}); go('orders'); return; }
    if (params.get('paid')) {
      setBanner({ tone: 'info', text: 'Confirming your payment…' });
      shop('confirm', { order_id: orderId }).then(({ order }) => {
        setBanner(order?.status === 'awaiting_payment' ? { tone: 'info', text: 'Payment is processing. Your order starts as soon as it clears.' } : { tone: 'ok', text: 'Paid. Your order is on its way to the printer.' });
        go('orders');
      }).catch((e) => {
        setBanner({ tone: 'warn', text: /not found/i.test(e.message) ? "Payment received, but this order was placed from a different login. Sign in with the account that placed it to see it in My orders. It's still sent to the printer." : e.message });
        go('orders');
      });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const tabs = [['order', 'Order prints', Printer], ['lists', 'Mailing lists', Users], ['orders', 'My orders', Package], ...(catalog?.is_owner ? [['settings', 'Print settings', SettingsIcon]] : [])];
  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-end gap-3 mb-5">
        <div className="flex-1 min-w-[220px]">
          <h1 className="text-2xl font-bold flex items-center gap-2"><Printer className="w-6 h-6 text-primary" /> Print &amp; mail</h1>
          <p className="text-sm text-muted-foreground">Turn your designs into postcards mailed to your list, or flyers and business cards shipped to your door.</p>
        </div>
        <div className="flex rounded-full border p-1 text-sm overflow-x-auto">
          {tabs.map(([k, l, Icon]) => (
            <button key={k} onClick={() => go(k)} className={cn('px-3.5 py-1.5 rounded-full flex items-center gap-1.5 whitespace-nowrap', view === k ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}><Icon className="w-4 h-4" />{l}</button>
          ))}
        </div>
      </div>
      {catalog?.test_mode && <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 text-amber-900 text-sm px-4 py-2.5 flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> Test mode: orders aren't charged, printed or mailed.{catalog.is_owner && ' Turn it off in Print settings when you go live.'}</div>}
      {banner && <div className={cn('mb-4 rounded-xl text-sm px-4 py-2.5 flex items-center gap-2', banner.tone === 'ok' ? 'bg-emerald-50 text-emerald-900' : banner.tone === 'warn' ? 'bg-amber-50 text-amber-900' : 'bg-blue-50 text-blue-900')}>{banner.tone === 'ok' ? <Check className="w-4 h-4" /> : <Loader2 className={cn('w-4 h-4', banner.tone === 'info' && 'animate-spin')} />}{banner.text}<button className="ml-auto" onClick={() => setBanner(null)} aria-label="Dismiss"><X className="w-4 h-4" /></button></div>}
      {!catalog ? <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        : view === 'lists' ? <MailingLists user={user} brokerageId={brokerageId} catalog={catalog} />
          : view === 'orders' ? <Orders user={user} brokerageId={brokerageId} catalog={catalog} />
            : view === 'settings' && catalog.is_owner ? <PrintSettings catalog={catalog} onSaved={refetch} />
              : <OrderFlow user={user} brokerageId={brokerageId} catalog={catalog} preselect={params.get('design')} preselectProduct={params.get('product')} openEditor={params.get('edit') === '1'} onPlaced={(o, test) => { setBanner({ tone: 'ok', text: test ? 'Test order placed. Nothing was charged, printed or mailed.' : 'Order placed.' }); go('orders'); }} />}
    </div>
  );
}

// ---------------------------------------------------------------- ordering
function OrderFlow({ user, brokerageId, catalog, preselect, preselectProduct, openEditor, onPlaced }) {
  const queryClient = useQueryClient();
  const { agent: baseAgent, brand } = useBrand(user, brokerageId);
  const [product, setProduct] = useState(null);
  const [designId, setDesignId] = useState(preselect || null);
  // 'editor' (designed here, drag and drop), 'design' (an AI design as is) or 'upload' (their own artwork)
  const [source, setSource] = useState('editor');
  const [doc, setDoc] = useState(null);
  const [docTitle, setDocTitle] = useState('');
  const [docDesignId, setDocDesignId] = useState(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [saveState, setSaveState] = useState(''); // '', 'saving', 'saved', or an error
  const [upFront, setUpFront] = useState(null);
  const [upBack, setUpBack] = useState(null);
  const [backMode, setBackMode] = useState('ours'); // postcards: our back with their message, or their own art
  const [backHeadline, setBackHeadline] = useState('');
  const [backMessage, setBackMessage] = useState('');
  const [recips, setRecips] = useState({ recipients: [], list_id: null, label: '' });
  const [returnAddr, setReturnAddr] = useState(true);
  const [quantity, setQuantity] = useState(null);
  const [ship, setShip] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const frontRef = useRef(null); const backRef = useRef(null);

  const { data: designs = [] } = useQuery({
    queryKey: ['designs-for-print', brokerageId, user?.email],
    queryFn: () => base44.entities.MarketingDesign.filter({ brokerage_id: brokerageId, owner_email: String(user.email).toLowerCase() }, '-updated_date', 100),
    enabled: !!brokerageId && !!user,
  });
  const design = designs.find((d) => d.id === designId) || null;
  const p = product ? PRODUCTS[product] : null;
  const agent = baseAgent;
  const color = design?.data?.content?.palette?.primary || brand.color || '#0f172a';

  // ---- editor designs
  const loadSaved = (d) => {
    setDoc(refreshBrand(resizeDoc(d.data.editor, product || d.data.editor.product), { agent, brand }));
    setDocDesignId(d.id); setDocTitle(d.title || ''); setSource('editor');
  };
  /** A fresh editor design, filled from an AI design / kit piece (or just the agent's info). */
  const startFrom = (d) => {
    const data = d ? { listing: d.data?.listing, photos: d.data?.photos, content: d.data?.content, kind: d.kind, bgImage: d.data?.bgImage } : { kind: 'agent_intro' };
    setDoc(newDoc(product, { ...data, agent, brand }, !d && PRODUCTS[product].mailed ? { front: 'agent_intro' } : {}));
    setDocDesignId(null); setDocTitle(d?.title || `${p.short} design`); setSource('editor'); setEditorOpen(true);
  };
  const saveDoc = async (d, title) => {
    setDoc(d); setDocTitle(title);
    const rec = {
      brokerage_id: brokerageId, owner_email: String(user.email).toLowerCase(), title, kind: d.src?.kind || 'custom', format: d.product,
      transaction_id: d.src?.listing?.transaction_id || undefined,
      data: { editor: d, listing: d.src?.listing || {}, photos: d.src?.photos || [], content: d.src?.content || null },
    };
    if (docDesignId) await base44.entities.MarketingDesign.update(docDesignId, rec);
    else { const r = await base44.entities.MarketingDesign.create(rec); setDocDesignId(r.id); }
    queryClient.invalidateQueries({ queryKey: ['designs-for-print'] });
    queryClient.invalidateQueries({ queryKey: ['designs'] });
  };
  const saveNow = async (d = doc, title = docTitle) => {
    setSaveState('saving');
    try { await saveDoc(d, (title || '').trim() || `${p.short} design`); setSaveState('saved'); } catch (e) { setSaveState(e.message || 'Could not save'); }
  };
  // Leaving the editor: keep the changes, and update My designs if it's already saved there.
  const closeEditor = (d, t) => {
    setDoc(d); if (t) setDocTitle(t); setEditorOpen(false);
    if (docDesignId) saveNow(d, t || docTitle); else setSaveState('');
  };
  const editorDesigns = designs.filter((d) => d.data?.editor && product && sameShape(d.data.editor.product, product));
  const aiDesigns = designs.filter((d) => !d.data?.editor);
  useEffect(() => {
    if (!preselect || !designs.length || product) return;
    const d = designs.find((x) => x.id === preselect);
    setProduct(PRODUCTS[preselectProduct] ? preselectProduct : PRODUCTS[d?.format] ? d.format : d?.format === 'flyer' ? 'flyer_letter' : 'postcard_4x6');
  }, [preselect, designs.length]); // eslint-disable-line react-hooks/exhaustive-deps
  // Opened with a design: one made in the editor opens in the editor; an AI design is used as is.
  const preselectDone = useRef(false);
  useEffect(() => {
    if (preselectDone.current || !preselect || !designs.length || !product) return;
    const d = designs.find((x) => x.id === preselect); if (!d) return;
    preselectDone.current = true;
    if (d.data?.editor && sameShape(d.data.editor.product, product)) { loadSaved(d); if (openEditor) setEditorOpen(true); } else if (!d.data?.editor) setSource('design');
  }, [preselect, designs.length, product]); // eslint-disable-line react-hooks/exhaustive-deps
  // Switching between 4x6 and 6x9 keeps the design (scaled); other products start fresh.
  useEffect(() => {
    if (!product) return;
    if (doc && doc.product !== product) { if (sameShape(doc.product, product)) setDoc(resizeDoc(doc, product)); else { setDoc(null); setDocDesignId(null); } }
    if (product === 'business_cards' && source === 'design') setSource('editor');
  }, [product]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!design) return;
    const c = design.data?.content || {};
    setBackHeadline((h) => h || c.headline || '');
    setBackMessage((m) => m || fitSentences(String(c.body || c.subheadline || ''), 320));
  }, [design?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (ship || !user) return;
    setShip({ name: user.display_name || user.full_name || '', address_line1: user.address || '', city: user.city || '', state: user.state || '', zip: user.zip || '', phone: user.phone || '' });
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (p?.quantities && !p.quantities.includes(quantity)) setQuantity(p.quantities[1] || p.quantities[0]); }, [product]); // eslint-disable-line react-hooks/exhaustive-deps

  const price = p ? priceFor(product, { quantity, recipients: recips.recipients.length }, catalog.settings || { prices: Object.fromEntries(catalog.products.map((x) => [x.key, x.prices])) }) : null;
  const returnAddress = (() => { const a = cleanAddress({ name: agent.name, address_line1: user?.address, city: user?.city, state: user?.state, zip: user?.zip }); return a.address || null; })();
  const editing = source === 'editor';
  const uploading = source === 'upload';
  const haveFront = editing ? !!doc?.pages?.front : uploading ? !!upFront : !!design;
  const haveBack = !p || p.sides === 1 ? true
    : editing ? !!doc?.pages?.back
      : uploading && product === 'business_cards' ? !!upBack
        : p.mailed ? backMode === 'ours' || !!upBack : true;
  const ready = p && haveFront && haveBack && (p.mailed ? recips.recipients.length > 0 : !!quantity && !!cleanAddress(ship || {}).address) && price != null;
  const blanks = editing && doc ? emptySpots(doc) : [];

  const place = async () => {
    if (blanks.length && !window.confirm(`Some spots are still empty (${[...new Set(blanks.map((b) => b.what))].join(', ')}). Empty photo frames print blank. Order anyway?`)) return;
    setBusy('Making your print files…'); setError('');
    try {
      const stamp = Date.now().toString(36);
      let files;
      if (p.vendor === 'lob') {
        const [front, back] = await Promise.all([drawTrim(frontRef.current), drawTrim(backRef.current)]);
        setBusy('Uploading…');
        const [f, b] = await Promise.all([uploadPrintFile(user, await toBlob(addBleed(front, product)), `postcard-front-${stamp}.png`), uploadPrintFile(user, await toBlob(addBleed(back, product)), `postcard-back-${stamp}.png`)]);
        files = { front: f, back: b };
      } else {
        const pages = [await drawTrim(frontRef.current)];
        if (p.sides === 2) pages.push(await drawTrim(backRef.current));
        setBusy('Uploading…');
        files = { pdf: await uploadPrintFile(user, makePdf(product, pages.map((c) => addBleed(c, product))), `${product}-${stamp}.pdf`) };
      }
      setBusy(catalog.test_mode ? 'Placing your test order…' : 'Opening secure checkout…');
      const r = await shop('order', {
        product, quantity, files,
        design_id: editing ? docDesignId || undefined : uploading ? undefined : design?.id,
        transaction_id: editing ? doc?.src?.listing?.transaction_id || undefined : uploading ? undefined : design?.transaction_id || design?.data?.listing?.transaction_id || undefined,
        ...(p.mailed ? (recips.list_id ? { list_id: recips.list_id } : { recipients: recips.recipients }) : {}),
        ship_to: p.mailed ? (returnAddr ? returnAddress : null) : ship,
      });
      if (r.checkout_url) { window.location.href = r.checkout_url; return; }
      onPlaced(r.order, r.test);
    } catch (err) { setError(err.message); } finally { setBusy(''); }
  };

  if (!p) {
    return (
      <div className="grid sm:grid-cols-2 gap-4">
        {catalog.products.map((x) => {
          const Icon = ICON[x.key] || Printer;
          const from = x.mailed ? `${money(x.prices.each)} each, postage included` : `From ${money(Math.min(...x.quantities.map((q) => x.prices[q] ?? Infinity)))} for ${x.quantities[0]}`;
          const off = x.vendor === 'lob' ? !catalog.connected.lob : !catalog.connected.gelato;
          return (
            <button key={x.key} disabled={off || !catalog.can_pay} onClick={() => setProduct(x.key)} className="text-left rounded-2xl border bg-card p-5 hover:shadow-md hover:border-primary/40 transition disabled:opacity-60 disabled:hover:shadow-none">
              <div className="flex items-center gap-3"><span className="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center"><Icon className="w-5 h-5" /></span>
                <div><p className="font-semibold">{x.label}</p><p className="text-sm text-muted-foreground">{from}</p></div></div>
              <p className="text-sm text-muted-foreground mt-3">{x.blurb}</p>
              {(off || !catalog.can_pay) && <p className="text-xs text-amber-700 mt-2">Not available yet. {catalog.is_owner ? 'Connect it in Print settings.' : 'Your platform owner is setting this up.'}</p>}
            </button>
          );
        })}
      </div>
    );
  }

  const docBack = doc?.product === product ? doc.pages.back : null;
  const frontEl = editing ? (doc?.product === product ? <EditorPage product={product} side="front" page={doc.pages.front} /> : null)
    : uploading ? (upFront ? <UploadedArt product={product} src={upFront} /> : null)
      : design ? <Design format={p.mailed ? product : 'flyer'} content={design.data?.content} listing={design.data?.listing} photos={design.data?.photos} agent={agent} brand={brand} bgImage={design.data?.bgImage} scale={1} /> : null;
  const ownBack = (uploading && product === 'business_cards') || (!editing && p.mailed && backMode === 'upload');
  const backEl = editing ? (docBack ? <EditorPage product={product} side="back" page={docBack} /> : null)
    : ownBack ? (upBack ? <UploadedArt product={product} src={upBack} keepAddressClear={p.mailed} /> : null)
      : p.mailed ? <PostcardBack product={product} headline={backHeadline} message={backMessage} agent={agent} brand={brand} color={color} /> : null;
  const guideBack = editing ? (docBack ? <EditorPage product={product} side="back" page={docBack} showGuides={p.mailed} /> : null)
    : ownBack ? (upBack ? <UploadedArt product={product} src={upBack} keepAddressClear={p.mailed} showGuides /> : null)
      : p.mailed ? <PostcardBack product={product} headline={backHeadline} message={backMessage} agent={agent} brand={brand} color={color} showGuides /> : backEl;
  const [tw, th] = p.trim;
  const sizeHint = `${tw}×${th} in (${Math.round(tw * 300)}×${Math.round(th * 300)} px at 300 dpi). A file with a 1/8" bleed works too.`;
  const sourceSwitch = (
    <div className="flex gap-1 rounded-lg bg-muted p-1 text-sm mb-3">
      {[['editor', 'Design it here'], ...(product === 'business_cards' ? [] : [['design', 'AI design as is']]), ['upload', 'Upload my own']].map(([k, l]) => <button key={k} onClick={() => setSource(k)} className={cn('flex-1 rounded-md py-1.5 px-1', source === k ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground')}>{l}</button>)}
    </div>
  );

  const thumbH = p.trim[0] > p.trim[1] ? 84 : 120;
  const editorBlock = doc?.product === product ? (
    <div>
      <div className="flex flex-wrap items-end gap-3">
        {Object.entries(doc.pages).map(([side, pg]) => (
          <button key={side} onClick={() => setEditorOpen(true)} className="text-left group">
            <EditorThumb product={product} side={side} page={pg} height={thumbH} className="rounded-md ring-1 ring-black/10 group-hover:ring-primary bg-white" />
            <span className="text-xs text-muted-foreground capitalize">{side}</span>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 mt-3">
        <Button onClick={() => setEditorOpen(true)} className="gap-1.5"><Pencil className="w-4 h-4" /> Edit design</Button>
        <Button variant="outline" onClick={() => saveNow()} disabled={saveState === 'saving'} className="gap-1.5">{saveState === 'saving' ? <Loader2 className="w-4 h-4 animate-spin" /> : saveState === 'saved' ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}{saveState === 'saved' ? 'Saved' : docDesignId ? 'Save changes' : 'Save to My designs'}</Button>
        <Button variant="outline" onClick={() => { if (window.confirm('Start over with a new design?')) { setDoc(null); setDocDesignId(null); setSaveState(''); } }} className="gap-1.5"><RotateCcw className="w-4 h-4" /> Start over</Button>
      </div>
      {!docDesignId && <Input value={docTitle} onChange={(e) => { setDocTitle(e.target.value); setSaveState(''); }} placeholder="Name this design (optional)" className="mt-2 max-w-xs h-8 text-sm" />}
      {saveState && !['saving', 'saved'].includes(saveState) && <p className="text-xs text-red-600 mt-2">{saveState}</p>}
      {docDesignId && <p className="text-xs text-muted-foreground mt-2">Saved in Marketing → Designs → My designs{docTitle ? ` as "${docTitle}"` : ''}. Changes save automatically when you close the editor.</p>}
    </div>
  ) : (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => startFrom(null)} className="gap-1.5"><Wand2 className="w-4 h-4" /> Start with my info</Button>
      </div>
      {aiDesigns.length > 0 && (
        <div>
          <p className="text-sm font-medium">Or fill it from one of your designs</p>
          <p className="text-xs text-muted-foreground mb-2">Uses its words, property details and photos in a layout you can change freely.</p>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {aiDesigns.slice(0, 30).map((d) => (
              <button key={d.id} onClick={() => startFrom(d)} className="flex-shrink-0 w-28 rounded-xl border-2 border-transparent hover:border-primary/50 overflow-hidden text-left">
                <div className="h-32 bg-muted overflow-hidden">{d.thumbnail_url ? <img src={d.thumbnail_url} alt="" className="w-full h-full object-cover object-top" /> : <div className="origin-top-left" style={{ transform: 'scale(0.14)' }}><Design format={d.format} content={d.data?.content} listing={d.data?.listing} photos={d.data?.photos} agent={agent} brand={brand} bgImage={d.data?.bgImage} /></div>}</div>
                <p className="text-xs p-1.5 truncate">{d.title}</p>
              </button>
            ))}
          </div>
        </div>
      )}
      {editorDesigns.length > 0 && (
        <div>
          <p className="text-sm font-medium mb-2">Or open one you made here</p>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {editorDesigns.map((d) => (
              <button key={d.id} onClick={() => loadSaved(d)} className="flex-shrink-0 text-left rounded-xl border-2 border-transparent hover:border-primary/50 p-1">
                <EditorThumb product={d.data.editor.product} page={d.data.editor.pages.front} height={thumbH} className="rounded-md ring-1 ring-black/10 bg-white" />
                <p className="text-xs pt-1 truncate max-w-[140px]">{d.title}</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-6">
      {editorOpen && doc && (
        <PrintEditor product={product} initialDoc={doc} agent={agent} brand={brand} title={docTitle}
          onClose={closeEditor}
          onUse={closeEditor}
          onSave={saveDoc} />
      )}
      <div className="space-y-5 min-w-0">
        <button onClick={() => { setProduct(null); setError(''); }} className="text-sm text-muted-foreground flex items-center gap-1 hover:text-foreground"><ArrowLeft className="w-4 h-4" /> All products</button>
        <h2 className="text-lg font-semibold">{p.label}</h2>

        {product !== 'business_cards' && (
          <Step n={1} title={editing && p.sides === 2 ? 'Your postcard' : p.sides === 2 ? 'Front' : 'Your flyer'}>
            {sourceSwitch}
            {editing ? editorBlock : uploading ? (
              <ArtUpload label="Front artwork" hint={sizeHint} width={tw * 300} value={upFront} onChange={setUpFront} onSecondPage={(u) => { if (p.sides === 2 && !upBack) { setUpBack(u); setBackMode('upload'); } }} />
            ) : !designs.length ? <p className="text-sm text-muted-foreground">You don't have saved designs yet. Make one in <b>Designs</b>, save it, then come back.</p> : (
              <div className="flex gap-3 overflow-x-auto pb-2">
                {designs.map((d) => (
                  <button key={d.id} onClick={() => setDesignId(d.id)} className={cn('flex-shrink-0 w-28 rounded-xl border-2 overflow-hidden text-left', designId === d.id ? 'border-primary' : 'border-transparent')}>
                    <div className="h-32 bg-muted overflow-hidden">{d.thumbnail_url ? <img src={d.thumbnail_url} alt="" className="w-full h-full object-cover object-top" /> : <div className="origin-top-left" style={{ transform: 'scale(0.14)' }}><Design format={d.format} content={d.data?.content} listing={d.data?.listing} photos={d.data?.photos} agent={agent} brand={brand} bgImage={d.data?.bgImage} /></div>}</div>
                    <p className="text-xs p-1.5 truncate">{d.title}</p>
                  </button>
                ))}
              </div>
            )}
          </Step>
        )}

        {p.mailed && !editing && (
          <Step n={2} title="Back of the postcard">
            <div className="flex gap-1 rounded-lg bg-muted p-1 text-sm mb-3">
              {[['ours', 'Message + my info'], ['upload', 'Upload my own back']].map(([k, l]) => <button key={k} onClick={() => setBackMode(k)} className={cn('flex-1 rounded-md py-1.5', backMode === k ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground')}>{l}</button>)}
            </div>
            {backMode === 'upload' ? (
              <ArtUpload label="Back artwork" hint={`${sizeHint} The address and postage box on the right is covered in white automatically, so keep that area empty.`} width={tw * 300} value={upBack} onChange={setUpBack} />
            ) : (<>
            <Input value={backHeadline} onChange={(e) => setBackHeadline(e.target.value)} placeholder="Headline (e.g. Just listed in your neighborhood)" maxLength={60} />
            <Textarea value={backMessage} onChange={(e) => setBackMessage(e.target.value.slice(0, 320))} placeholder="A short note to the neighbors" className="mt-2 min-h-[90px]" />
            <p className="text-xs text-muted-foreground mt-1">{backMessage.length}/320. Your photo, contact info, logo and Equal Housing notice are added for you. The right side is kept clear for the address and postage.</p>
            </>)}
          </Step>
        )}

        {product === 'business_cards' && (
          <Step n={1} title="Your card">
            {sourceSwitch}
            {uploading ? (
              <div className="space-y-3">
                <ArtUpload label="Front" hint={sizeHint} width={tw * 300} value={upFront} onChange={setUpFront} onSecondPage={(u) => { if (!upBack) setUpBack(u); }} />
                <ArtUpload label="Back" hint="A 2-page PDF fills both sides at once." width={tw * 300} value={upBack} onChange={setUpBack} />
              </div>
            ) : editorBlock}
          </Step>
        )}

        {p.mailed ? (
          <Step n={editing ? 2 : 3} title="Who gets it">
            <RecipientPicker user={user} brokerageId={brokerageId} value={recips} onChange={setRecips} />
            <label className="flex items-start gap-2 text-sm mt-3"><input type="checkbox" className="mt-1" checked={returnAddr && !!returnAddress} disabled={!returnAddress} onChange={(e) => setReturnAddr(e.target.checked)} />
              <span>Print my return address{returnAddress ? ` (${returnAddress.address_line1}, ${returnAddress.city})` : ''}{!returnAddress && <span className="block text-xs text-muted-foreground">Add your address in My Profile to include one.</span>}</span></label>
          </Step>
        ) : (
          <Step n={2} title="Quantity and shipping">
            <div className="flex flex-wrap gap-2 mb-3">
              {p.quantities.map((q) => { const c = priceFor(product, { quantity: q }, catalog.settings || { prices: Object.fromEntries(catalog.products.map((x) => [x.key, x.prices])) }); return (
                <button key={q} onClick={() => setQuantity(q)} className={cn('rounded-xl border px-3 py-2 text-sm text-left', quantity === q ? 'border-primary bg-primary/5' : 'hover:bg-muted')}><span className="font-semibold block">{q}</span><span className="text-xs text-muted-foreground">{money(c)}</span></button>
              ); })}
            </div>
            {ship && <AddressForm value={ship} onChange={setShip} />}
          </Step>
        )}

        <div className="rounded-2xl border bg-card p-4 flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[160px]">
            <p className="text-sm text-muted-foreground">{p.mailed ? `${recips.recipients.length.toLocaleString()} postcard${recips.recipients.length === 1 ? '' : 's'}, postage included` : `${quantity || 0} ${p.short.toLowerCase()}, shipping included`}</p>
            <p className="text-2xl font-bold">{price != null ? money(price) : '—'}</p>
          </div>
          <Button size="lg" disabled={!ready || !!busy} onClick={place} className="gap-2">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}{busy || (catalog.test_mode ? 'Place test order' : `Pay ${price != null ? money(price) : ''}`)}</Button>
          {error && <p className="w-full text-sm text-red-600">{error}</p>}
          {!catalog.test_mode && <p className="w-full text-xs text-muted-foreground">You'll pay by card on Stripe's secure checkout. {p.mailed ? 'Postcards usually arrive in 4–8 business days.' : 'Orders usually arrive in 5–9 business days.'}</p>}
        </div>
      </div>

      <div className="min-w-0 space-y-4 lg:sticky lg:top-24 self-start">
        <p className="text-xs font-semibold uppercase text-muted-foreground">Proof</p>
        {frontEl ? <Proof label="Front" el={frontEl} product={product} /> : <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">{editing ? 'Start a design to see the proof.' : 'Pick a design to see the proof.'}</div>}
        {guideBack && <Proof label="Back" el={guideBack} product={product} />}
        {blanks.length > 0 && <p className="text-xs text-amber-700 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> Still empty: {[...new Set(blanks.map((b) => b.what))].join(', ')}. Empty photo frames print blank.</p>}
        <p className="text-xs text-muted-foreground">Check spelling, phone and price before ordering. Everything near the edge may be trimmed slightly.</p>
      </div>

      {/* Full-size copies used to make the print files. */}
      <div aria-hidden style={{ position: 'fixed', left: -30000, top: 0, pointerEvents: 'none' }}>
        <div ref={frontRef} style={{ display: 'inline-block' }}>{frontEl}</div>
        <div ref={backRef} style={{ display: 'inline-block' }}>{backEl}</div>
      </div>
    </div>
  );
}

/** The agent's own artwork: a picture or a PDF (page 1; page 2 can fill the back). */
function ArtUpload({ label, hint, width, value, onChange, onSecondPage }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const read = async (file) => {
    if (!file) return;
    setBusy(true); setErr('');
    try {
      if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
        const pdf = await openPdf(file);
        onChange(await pageImage(pdf, 1, Math.round(width)));
        if (pdf.numPages > 1 && onSecondPage) onSecondPage(await pageImage(pdf, 2, Math.round(width)));
      } else if (/^image\//.test(file.type)) {
        onChange(await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); }));
      } else throw new Error('Use a PDF, PNG or JPG.');
    } catch (e) { setErr(e.message || 'Could not read that file.'); } finally { setBusy(false); }
  };
  return (
    <div>
      <p className="text-sm font-medium mb-1">{label}</p>
      <label className="flex items-center gap-3 rounded-xl border-2 border-dashed p-3 text-sm cursor-pointer hover:bg-muted/40">
        {value ? <img src={value} alt="" className="h-16 w-24 object-cover rounded border" /> : <span className="h-16 w-24 rounded border bg-muted flex items-center justify-center">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4 text-muted-foreground" />}</span>}
        <span className="flex-1"><span className="font-medium">{value ? 'Replace file' : 'Choose a PDF, PNG or JPG'}</span><span className="block text-xs text-muted-foreground">{hint}</span></span>
        <input type="file" accept="application/pdf,image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { read(e.target.files?.[0]); e.target.value = ''; }} />
      </label>
      {err && <p className="text-xs text-red-600 mt-1">{err}</p>}
    </div>
  );
}

function Step({ n, title, children }) {
  return <section className="rounded-2xl border bg-card p-4"><p className="font-semibold mb-3 flex items-center gap-2"><span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center">{n}</span>{title}</p>{children}</section>;
}

function Proof({ label, el, product }) {
  const box = useRef(null);
  const [w, setW] = useState(480);
  useEffect(() => { const ro = new ResizeObserver(([e]) => setW(e.contentRect.width)); if (box.current) ro.observe(box.current); return () => ro.disconnect(); }, []);
  const [tw, th] = PRODUCTS[product].trim;
  const k = w / (tw * 96);
  return (
    <div ref={box}>
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <div className="rounded-lg shadow-lg ring-1 ring-black/5 overflow-hidden bg-white" style={{ width: w, height: th * 96 * k }}>
        <div style={{ transform: `scale(${k})`, transformOrigin: 'top left', width: tw * 96, height: th * 96 }}>{el}</div>
      </div>
    </div>
  );
}

function AddressForm({ value, onChange }) {
  const set = (k) => (e) => onChange({ ...value, [k]: e.target.value });
  return (
    <div className="grid grid-cols-6 gap-2">
      <Input className="col-span-6" placeholder="Name" value={value.name || ''} onChange={set('name')} />
      <Input className="col-span-6" placeholder="Street address" value={value.address_line1 || ''} onChange={set('address_line1')} />
      <Input className="col-span-3" placeholder="City" value={value.city || ''} onChange={set('city')} />
      <Input className="col-span-1" placeholder="ST" maxLength={2} value={value.state || ''} onChange={set('state')} />
      <Input className="col-span-2" placeholder="ZIP" value={value.zip || ''} onChange={set('zip')} />
      <Input className="col-span-6" placeholder="Phone (for the courier)" value={value.phone || ''} onChange={set('phone')} />
    </div>
  );
}

// ---------------------------------------------------------------- recipients
function useContactsWithAddress(user, brokerageId) {
  return useQuery({
    queryKey: ['contacts-addresses', brokerageId, user?.email],
    queryFn: async () => (await base44.entities.Contact.filter({ brokerage_id: brokerageId, owner_email: String(user.email).toLowerCase() }, 'name', 2000))
      .map((c) => { const a = splitAddress(c.address); return a ? { id: c.id, ...a, name: c.name || 'Current Resident', tags: c.tags || [], type: c.type } : null; }).filter(Boolean),
    enabled: !!brokerageId && !!user,
  });
}

function RecipientPicker({ user, brokerageId, value, onChange }) {
  const [mode, setMode] = useState('lists');
  const { data: lists = [] } = useQuery({
    queryKey: ['mailing-lists', brokerageId, user?.email],
    queryFn: () => base44.entities.MailingList.filter({ brokerage_id: brokerageId, owner_email: String(user.email).toLowerCase() }, '-updated_date', 100),
    enabled: !!brokerageId && !!user,
  });
  const { data: contacts = [] } = useContactsWithAddress(user, brokerageId);
  const [picked, setPicked] = useState(new Set());
  const [csv, setCsv] = useState(null);
  useEffect(() => { if (mode === 'contacts') onChange({ recipients: contacts.filter((c) => picked.has(c.id)), list_id: null, label: `${picked.size} contacts` }); }, [picked, mode]); // eslint-disable-line react-hooks/exhaustive-deps
  const readCsv = async (file) => { if (!file) return; const r = parseAddressCsv(await file.text()); setCsv({ ...r, name: file.name.replace(/\.csv$/i, '') }); onChange({ recipients: r.recipients, list_id: null, label: file.name }); };
  return (
    <div>
      <div className="flex gap-1 rounded-lg bg-muted p-1 text-sm mb-3">
        {[['lists', 'Saved list'], ['upload', 'Upload CSV'], ['contacts', 'My contacts']].map(([k, l]) => <button key={k} onClick={() => { setMode(k); onChange({ recipients: [], list_id: null, label: '' }); }} className={cn('flex-1 rounded-md py-1.5', mode === k ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground')}>{l}</button>)}
      </div>
      {mode === 'lists' && (!lists.length ? <p className="text-sm text-muted-foreground">No saved lists yet. Upload a CSV or use My contacts, or build lists under Mailing lists.</p> : (
        <ul className="space-y-1.5">
          {lists.map((l) => (
            <li key={l.id}><label className={cn('flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer', value.list_id === l.id && 'border-primary bg-primary/5')}>
              <input type="radio" checked={value.list_id === l.id} onChange={() => onChange({ recipients: l.recipients || [], list_id: l.id, label: l.name })} />
              <span className="flex-1">{l.name}</span><span className="text-muted-foreground">{(l.recipient_count ?? (l.recipients || []).length).toLocaleString()} addresses</span></label></li>
          ))}
        </ul>
      ))}
      {mode === 'upload' && (
        <div>
          <label className="flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed p-5 text-sm text-muted-foreground cursor-pointer hover:bg-muted/40">
            <Upload className="w-5 h-5" /> Choose a CSV file
            <span className="text-xs">Columns: name, address, city, state, zip</span>
            <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => readCsv(e.target.files?.[0])} />
          </label>
          {csv && <CsvSummary csv={csv} />}
          {csv?.recipients.length > 0 && <SaveListButton user={user} brokerageId={brokerageId} name={csv.name} recipients={csv.recipients} source="csv" />}
        </div>
      )}
      {mode === 'contacts' && (
        !contacts.length ? <p className="text-sm text-muted-foreground">None of your contacts have a full mailing address yet.</p> : (
          <div>
            <div className="flex items-center justify-between text-sm mb-2"><span>{picked.size} of {contacts.length} picked</span>
              <button className="text-primary" onClick={() => setPicked(picked.size === contacts.length ? new Set() : new Set(contacts.map((c) => c.id)))}>{picked.size === contacts.length ? 'Clear' : 'Pick all'}</button></div>
            <ul className="max-h-60 overflow-y-auto rounded-lg border divide-y">
              {contacts.map((c) => <li key={c.id}><label className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer"><input type="checkbox" checked={picked.has(c.id)} onChange={() => setPicked((s) => { const n = new Set(s); n.has(c.id) ? n.delete(c.id) : n.add(c.id); return n; })} /><span className="flex-1 truncate">{c.name}</span><span className="text-xs text-muted-foreground truncate">{c.address_line1}, {c.city}</span></label></li>)}
            </ul>
          </div>
        )
      )}
    </div>
  );
}

function CsvSummary({ csv }) {
  return (
    <div className="mt-2 text-sm">
      <p className="text-emerald-700 flex items-center gap-1"><Check className="w-4 h-4" /> {csv.recipients.length.toLocaleString()} addresses ready</p>
      {csv.problems.length > 0 && <details open className="text-amber-700"><summary className="cursor-pointer">{csv.problems.length} row{csv.problems.length === 1 ? '' : 's'} skipped</summary><ul className="text-xs mt-1 max-h-32 overflow-y-auto">{csv.problems.slice(0, 100).map((p) => <li key={p.row}>Row {p.row}: {p.error}</li>)}</ul></details>}
    </div>
  );
}

function SaveListButton({ user, brokerageId, name, recipients, source }) {
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const n = window.prompt('Name this list', name || 'My list'); if (!n) return;
    setBusy(true);
    try { await base44.entities.MailingList.create({ brokerage_id: brokerageId, owner_email: String(user.email).toLowerCase(), name: n.slice(0, 80), recipients, recipient_count: recipients.length, source }); setSaved(true); queryClient.invalidateQueries({ queryKey: ['mailing-lists'] }); }
    catch (err) { window.alert(err.message); } finally { setBusy(false); }
  };
  return <Button size="sm" variant="outline" className="mt-2 gap-1" onClick={save} disabled={saved || busy}>{saved ? <><Check className="w-3.5 h-3.5" /> Saved</> : 'Save as a list'}</Button>;
}

// ---------------------------------------------------------------- mailing lists
function MailingLists({ user, brokerageId, catalog }) {
  const queryClient = useQueryClient();
  const { data: lists = [], isLoading } = useQuery({
    queryKey: ['mailing-lists', brokerageId, user?.email],
    queryFn: () => base44.entities.MailingList.filter({ brokerage_id: brokerageId, owner_email: String(user.email).toLowerCase() }, '-updated_date', 100),
    enabled: !!brokerageId && !!user,
  });
  const { data: contacts = [] } = useContactsWithAddress(user, brokerageId);
  const [csv, setCsv] = useState(null);
  const [checking, setChecking] = useState(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['mailing-lists'] });
  const check = async (l) => {
    if (!catalog.connected.lob) return window.alert('Address checking turns on once mailing is connected.');
    setChecking(l.id);
    try {
      const all = l.recipients || [];
      const results = [];
      for (let i = 0; i < all.length; i += 500) results.push(...(await shop('verify', { recipients: all.slice(i, i + 500) })).results);
      const good = results.filter((r) => r.ok).map((r) => r.address);
      const bad = results.length - good.length;
      if (window.confirm(`${good.length} deliverable, ${bad} undeliverable. ${bad ? 'Remove the undeliverable ones and clean up the rest?' : 'Clean up the addresses (standard format)?'}`)) {
        await base44.entities.MailingList.update(l.id, { recipients: good, recipient_count: good.length, verified_at: new Date().toISOString() });
        refresh();
      }
    } catch (err) { window.alert(err.message); } finally { setChecking(null); }
  };
  return (
    <div className="grid lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-6">
      <div>
        {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : !lists.length ? <p className="text-sm text-muted-foreground rounded-2xl border bg-card p-6">No mailing lists yet. Upload a CSV or build one from your contacts.</p> : (
          <ul className="rounded-2xl border bg-card divide-y">
            {lists.map((l) => (
              <li key={l.id} className="px-4 py-3 flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-[160px]"><p className="font-medium">{l.name}</p><p className="text-xs text-muted-foreground">{(l.recipient_count ?? (l.recipients || []).length).toLocaleString()} addresses{l.verified_at ? ` · checked ${fmtDate(new Date(l.verified_at), 'MMM d')}` : ''}</p></div>
                <Button size="sm" variant="outline" className="gap-1" onClick={() => check(l)} disabled={!!checking}>{checking === l.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ListChecks className="w-3.5 h-3.5" />} Check addresses</Button>
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={async () => { if (window.confirm(`Delete "${l.name}"?`)) { await base44.entities.MailingList.delete(l.id); refresh(); } }}><Trash2 className="w-4 h-4" /></Button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="space-y-4">
        <section className="rounded-2xl border bg-card p-4">
          <p className="font-semibold mb-2">Upload a list</p>
          <label className="flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed p-5 text-sm text-muted-foreground cursor-pointer hover:bg-muted/40">
            <Upload className="w-5 h-5" /> Choose a CSV file <span className="text-xs">Columns: name, address, city, state, zip</span>
            <input type="file" accept=".csv,text/csv" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setCsv({ ...parseAddressCsv(await f.text()), name: f.name.replace(/\.csv$/i, '') }); }} />
          </label>
          {csv && <CsvSummary csv={csv} />}
          {csv?.recipients.length > 0 && <SaveListButton user={user} brokerageId={brokerageId} name={csv.name} recipients={csv.recipients} source="csv" />}
        </section>
        <section className="rounded-2xl border bg-card p-4">
          <p className="font-semibold mb-1">From your contacts</p>
          <p className="text-sm text-muted-foreground mb-2">{contacts.length} of your contacts have a full mailing address.</p>
          {contacts.length > 0 && <SaveListButton user={user} brokerageId={brokerageId} name="My sphere" recipients={contacts.map(({ id, tags, type, ...a }) => a)} source="contacts" />}
        </section>
        <p className="text-xs text-muted-foreground">Only mail people you have a reason to contact, and follow your MLS and state rules for farming mailers.</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- orders
function Orders({ user, brokerageId, catalog }) {
  const admin = isAdminRole(user?.role) || catalog.is_owner;
  const [everyone, setEveryone] = useState(false);
  const queryClient = useQueryClient();
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['print-orders', brokerageId, everyone, user?.email],
    queryFn: () => base44.entities.PrintOrder.filter(everyone ? { brokerage_id: brokerageId } : { brokerage_id: brokerageId, owner_email: String(user.email).toLowerCase() }, '-created_date', 200),
    enabled: !!brokerageId && !!user,
    refetchInterval: 15000,
  });
  const total = useMemo(() => orders.filter((o) => !['awaiting_payment', 'cancelled'].includes(o.status) && !o.test_mode).reduce((s, o) => s + Number(o.amount_cents || 0) - Number(o.refund?.amount_cents || 0), 0), [orders]);
  const act = async (action, o) => { try { await shop(action, { order_id: o.id }); queryClient.invalidateQueries({ queryKey: ['print-orders'] }); } catch (err) { window.alert(err.message); } };
  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-3">
        {admin && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={everyone} onChange={(e) => setEveryone(e.target.checked)} /> Everyone in the brokerage</label>}
        <span className="ml-auto text-sm text-muted-foreground">Spent: <b className="text-foreground">{money(total)}</b></span>
      </div>
      {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : !orders.length ? <p className="text-sm text-muted-foreground rounded-2xl border bg-card p-6">No orders yet.</p> : (
        <ul className="rounded-2xl border bg-card divide-y">
          {orders.map((o) => {
            const [label, cls] = STATUS[o.status] || [o.status, 'bg-slate-100'];
            const Icon = ICON[o.product] || Package;
            return (
              <li key={o.id} className="px-4 py-3 flex flex-wrap items-start gap-3">
                <span className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center flex-shrink-0"><Icon className="w-4 h-4" /></span>
                <div className="flex-1 min-w-[200px]">
                  <p className="font-medium text-sm">{o.product_label}{o.test_mode && <span className="ml-2 text-[10px] rounded bg-amber-100 text-amber-800 px-1.5 py-0.5">TEST</span>}</p>
                  <p className="text-xs text-muted-foreground">{fmtDate(new Date(o.created_date), 'MMM d, h:mm a')}{everyone ? ` · ${o.owner_name || o.owner_email}` : ''} · {o.vendor === 'lob' ? `${(o.sent_count || 0).toLocaleString()} of ${(o.recipient_count || 0).toLocaleString()} mailed${o.failed_count ? `, ${o.failed_count} undeliverable` : ''}` : `Qty ${o.quantity}`}</p>
                  {o.vendor_ids?.expected_delivery && <p className="text-xs text-muted-foreground">Expected around {fmtDate(new Date(`${o.vendor_ids.expected_delivery}T12:00:00`), 'MMM d')}</p>}
                  {o.tracking?.url && <a href={o.tracking.url} target="_blank" rel="noreferrer" className="text-xs text-primary inline-flex items-center gap-1"><Truck className="w-3 h-3" /> Track package {o.tracking.code ? `(${o.tracking.code})` : ''}</a>}
                  {o.status === 'needs_attention' && o.problems?.length > 0 && <p className="text-xs text-red-600 mt-0.5">{o.problems[o.problems.length - 1].error}</p>}
                  {o.vendor === 'lob' && o.failed_count > 0 && o.problems?.length > 0 && (
                    <details className="text-xs text-muted-foreground mt-0.5"><summary className="cursor-pointer">Which addresses didn't go out</summary>
                      <ul className="mt-1 space-y-0.5">{o.problems.slice(0, 50).map((x) => <li key={x.i}>{x.address}: <span className="text-red-600">{x.error}</span></li>)}</ul>
                    </details>
                  )}
                </div>
                <div className="text-right">
                  <span className={cn('text-[11px] font-semibold rounded-full px-2 py-0.5', cls)}>{label}</span>
                  <p className="text-sm font-semibold mt-1">{money(o.amount_cents - Number(o.refund?.amount_cents || 0))}</p>
                  {o.refund?.amount_cents > 0 && <p className="text-[11px] text-emerald-700">{money(o.refund.amount_cents)} refunded for {o.refund.count} undeliverable</p>}
                  {o.status === 'awaiting_payment' && <button className="text-xs text-muted-foreground underline" onClick={() => act('cancel', o)}>Cancel</button>}
                  {o.status === 'needs_attention' && catalog.is_owner && <button className="text-xs text-primary underline" onClick={() => act('retry', o)}>Retry</button>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- platform owner settings
function PrintSettings({ catalog, onSaved }) {
  const [s, setS] = useState(catalog.settings);
  const [busy, setBusy] = useState(false);
  const [checks, setChecks] = useState({});
  const setPrice = (k, q, dollars) => setS((x) => ({ ...x, prices: { ...x.prices, [k]: { ...x.prices[k], [q]: Math.round(Number(dollars || 0) * 100) } } }));
  const save = async () => { setBusy(true); try { const r = await shop('settings_save', { settings: s }); setS(r.settings); onSaved(); } catch (err) { window.alert(err.message); } finally { setBusy(false); } };
  const [testSaved, setTestSaved] = useState(false);
  // Test mode saves on click, so it can't be left "off" on screen but still on for orders.
  const toggleTest = async (on) => {
    const next = { ...s, test_mode: on };
    setS(next); setBusy(true); setTestSaved(false);
    try { const r = await shop('settings_save', { settings: next }); setS(r.settings); setTestSaved(true); onSaved(); }
    catch (err) { setS((x) => ({ ...x, test_mode: !on })); window.alert(err.message); } finally { setBusy(false); }
  };
  const check = async (k) => { setChecks((c) => ({ ...c, [k]: 'checking' })); try { const r = await shop('check_product', { uid: s.gelato_uids[k] }); setChecks((c) => ({ ...c, [k]: `OK: ${r.product.name || 'found'}` })); } catch (err) { setChecks((c) => ({ ...c, [k]: `Not found: ${err.message}` })); } };
  const c = catalog.connected;
  const row = (ok, label, hint) => <li className="flex items-start gap-2 text-sm">{ok ? <Check className="w-4 h-4 text-emerald-600 mt-0.5" /> : <X className="w-4 h-4 text-red-500 mt-0.5" />}<span><b>{label}</b>{!ok && hint ? <span className="block text-xs text-muted-foreground">{hint}</span> : null}</span></li>;
  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <section className="rounded-2xl border bg-card p-5 space-y-4">
        <p className="font-semibold">Connections</p>
        <ul className="space-y-2">
          {row(c.stripe, 'Stripe (card payments)', 'Add STRIPE_SECRET_KEY in Vercel.')}
          {row(c.webhook, 'Stripe webhook', 'Add the webhook in Stripe and STRIPE_WEBHOOK_SECRET in Vercel (orders still confirm when agents return from checkout).')}
          {row(c.lob, `Lob (mailing)${c.lob ? (catalog.lob_test_key ? ': test key, nothing is mailed' : ': live') : ''}`, 'Add LOB_API_KEY in Vercel.')}
          {row(c.gelato, 'Gelato (printing and shipping)', 'Add GELATO_API_KEY in Vercel.')}
        </ul>
        <label className="flex items-start gap-2 text-sm rounded-xl border p-3"><input type="checkbox" className="mt-1" checked={!!s.test_mode} disabled={busy} onChange={(e) => toggleTest(e.target.checked)} />
          <span><b>Test mode {s.test_mode ? 'is on' : 'is off'}</b>{testSaved && <span className="ml-2 text-xs text-emerald-700">Saved</span>}<span className="block text-xs text-muted-foreground">{s.test_mode ? 'Orders skip payment and nothing is printed or mailed. Untick to take card payments.' : 'Agents pay by card at checkout. Real printing and mailing happen only with live Lob and Gelato keys.'} This saves as soon as you click it.</span></span></label>
        <div>
          <p className="text-sm font-medium mb-2">Gelato product codes</p>
          {Object.keys(s.gelato_uids).map((k) => (
            <div key={k} className="mb-2">
              <p className="text-xs text-muted-foreground">{PRODUCTS[k].label}</p>
              <div className="flex gap-2"><Input className="font-mono text-xs" value={s.gelato_uids[k]} onChange={(e) => setS((x) => ({ ...x, gelato_uids: { ...x.gelato_uids, [k]: e.target.value } }))} />
                <Button size="sm" variant="outline" onClick={() => check(k)} disabled={!c.gelato}>Check</Button></div>
              {checks[k] && <p className={cn('text-xs mt-0.5', String(checks[k]).startsWith('OK') ? 'text-emerald-700' : 'text-red-600')}>{checks[k]}</p>}
            </div>
          ))}
        </div>
      </section>
      <section className="rounded-2xl border bg-card p-5">
        <p className="font-semibold">Prices agents pay</p>
        <p className="text-xs text-muted-foreground mb-3">Include printing, shipping or postage, card fees and your margin. Lob charges about $0.65–$0.91 per 4×6 postcard; check Gelato's prices in its dashboard.</p>
        {Object.entries(PRODUCTS).map(([k, p]) => (
          <div key={k} className="mb-4">
            <p className="text-sm font-medium mb-1">{p.label}</p>
            <div className="flex flex-wrap gap-2">
              {(p.mailed ? ['each'] : p.quantities).map((q) => (
                <label key={q} className="text-xs text-muted-foreground">{p.mailed ? 'Per postcard' : `${q}`}
                  <div className="flex items-center rounded-md border bg-background px-2 mt-0.5"><span>$</span><input type="number" step="0.01" min="0" className="w-20 bg-transparent px-1 py-1.5 text-sm text-foreground outline-none" value={((s.prices[k]?.[q] ?? 0) / 100).toString()} onChange={(e) => setPrice(k, q, e.target.value)} /></div></label>
              ))}
            </div>
          </div>
        ))}
        <Button onClick={save} disabled={busy} className="gap-1.5">{busy && <Loader2 className="w-4 h-4 animate-spin" />} Save print settings</Button>
      </section>
    </div>
  );
}
