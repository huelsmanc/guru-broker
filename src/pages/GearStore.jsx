import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { ShoppingBag, ShoppingCart, Search, Loader2, Plus, Minus, Trash2, X, ExternalLink, Settings as SettingsIcon, Package } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const store = (action, body = {}) => base44.functions.invoke('gearStore', { action, ...body }).then((r) => r.data);
const fmt = (m) => (m ? new Intl.NumberFormat('en-US', { style: 'currency', currency: m.currency || 'USD' }).format(m.amount) : '');
const priceLabel = (p) => (!p.price_min ? '' : p.price_max && p.price_max.amount !== p.price_min.amount ? `From ${fmt(p.price_min)}` : fmt(p.price_min));

// The cart lives in this browser (per brokerage) until checkout.
const cartKey = (b) => `gbh_cart_${b}`;
const loadCart = (b) => { try { return JSON.parse(localStorage.getItem(cartKey(b)) || '[]'); } catch { return []; } };
const saveCart = (b, c) => { try { localStorage.setItem(cartKey(b), JSON.stringify(c)); } catch { /* private window */ } };

export default function GearStore() {
  const { user } = useOutletContext() || {};
  const brokerageId = user?.brokerage_id || 'none';
  const [status, setStatus] = useState(null);
  const [error, setError] = useState('');
  const [collections, setCollections] = useState([]);
  const [collection, setCollection] = useState('');
  const [query, setQuery] = useState('');
  const [typed, setTyped] = useState('');
  const [products, setProducts] = useState([]);
  const [page, setPage] = useState({ more: false, after: null });
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(null);
  const [cart, setCart] = useState([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const req = useRef(0);

  useEffect(() => { setCart(loadCart(brokerageId)); }, [brokerageId]);
  const updateCart = (fn) => setCart((c) => { const n = fn(c); saveCart(brokerageId, n); return n; });

  const refreshStatus = useCallback(() => store('status').then(setStatus).catch((e) => { setStatus({ connected: false }); setError(e.message); }), []);
  useEffect(() => { if (user) refreshStatus(); }, [user, refreshStatus]);

  useEffect(() => { const t = setTimeout(() => setQuery(typed.trim()), 350); return () => clearTimeout(t); }, [typed]);

  const load = useCallback(async (after) => {
    const n = ++req.current;
    setLoading(true); setError('');
    try {
      const d = await store('catalog', { collection: query ? undefined : collection || undefined, query: query || undefined, after: after || undefined });
      if (n !== req.current) return;
      if (d.collections) setCollections(d.collections);
      setProducts((cur) => (after ? [...cur, ...d.products] : d.products));
      setPage(d.page || { more: false });
    } catch (e) { if (n === req.current) setError(e.message); } finally { if (n === req.current) setLoading(false); }
  }, [collection, query]);
  useEffect(() => { if (status?.connected) load(); }, [status?.connected, load]);

  const count = cart.reduce((s, l) => s + l.quantity, 0);

  if (!status) return <div className="h-[60vh] flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  if (!status.connected) {
    return (
      <div className="p-4 sm:p-6 lg:p-10 max-w-3xl mx-auto">
        <Header />
        {status.can_manage ? <ConnectCard onDone={refreshStatus} /> : (
          <div className="rounded-2xl border bg-card p-10 text-center">
            <ShoppingBag className="w-10 h-10 mx-auto text-muted-foreground/50" />
            <p className="mt-3 font-semibold">The gear store isn't open yet</p>
            <p className="text-sm text-muted-foreground mt-1">Your broker hasn't connected the brokerage's store. Once they do, you can shop for gear right here.</p>
          </div>
        )}
        {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-10 max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-3">
        <Header shop={status.shop_name} />
        <div className="flex items-center gap-2 flex-shrink-0">
          {status.can_manage && <Button variant="outline" size="icon" className="rounded-xl" title="Store settings" aria-label="Store settings" onClick={() => setSettingsOpen(true)}><SettingsIcon className="w-4 h-4" /></Button>}
          <Button className="rounded-xl gap-2 relative" onClick={() => setCartOpen(true)} aria-label={`Cart, ${count} items`}>
            <ShoppingCart className="w-4 h-4" /><span className="hidden sm:inline">Cart</span>
            {count > 0 && <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-white text-primary text-[11px] font-bold flex items-center justify-center">{count}</span>}
          </Button>
        </div>
      </div>

      <div className="mt-5 flex flex-col sm:flex-row gap-3 sm:items-center">
        <div className="flex items-center gap-2 rounded-xl border bg-card px-3 h-10 sm:w-72">
          <Search className="w-4 h-4 text-muted-foreground" />
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Search gear" className="flex-1 min-w-0 bg-transparent outline-none text-base sm:text-sm" />
          {typed && <button onClick={() => setTyped('')} aria-label="Clear search"><X className="w-4 h-4 text-muted-foreground" /></button>}
        </div>
        {!query && collections.length > 0 && (
          <div className="flex gap-2 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 pb-1">
            {[{ handle: '', title: 'All' }, ...collections].map((c) => (
              <button key={c.handle || 'all'} onClick={() => setCollection(c.handle)}
                className={cn('flex-shrink-0 rounded-full px-3.5 py-1.5 text-sm border transition-colors', collection === c.handle ? 'bg-primary text-primary-foreground border-primary' : 'bg-card hover:bg-muted')}>{c.title}</button>
            ))}
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-600 mt-4">{error}</p>}
      {!loading && !products.length && !error && (
        <div className="py-20 text-center text-muted-foreground"><Package className="w-10 h-10 mx-auto opacity-40" /><p className="mt-2 text-sm">{query ? 'Nothing matches that search.' : 'No products here yet.'}</p></div>
      )}
      <div className="mt-5 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5">
        {products.map((p) => (
          <button key={p.id} onClick={() => setOpen(p)} className="group text-left rounded-2xl border bg-card overflow-hidden hover:shadow-lg transition-shadow flex flex-col justify-start">
            <div className="w-full aspect-square bg-muted relative overflow-hidden">
              {p.image ? <img src={p.image} alt={p.title} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                : <div className="w-full h-full flex items-center justify-center"><ShoppingBag className="w-10 h-10 text-muted-foreground/40" /></div>}
              {!p.available && <span className="absolute top-2 left-2 rounded-full bg-black/70 text-white text-[11px] font-medium px-2 py-0.5">Sold out</span>}
            </div>
            <div className="p-3">
              <p className="text-sm font-medium leading-snug line-clamp-2">{p.title}</p>
              <p className="text-sm text-muted-foreground mt-1">{priceLabel(p)}</p>
            </div>
          </button>
        ))}
      </div>
      {loading && <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>}
      {!loading && page.more && <div className="mt-6 flex justify-center"><Button variant="outline" onClick={() => load(page.after)}>Load more</Button></div>}

      {open && <ProductDialog product={open} onClose={() => setOpen(null)} onAdd={(line) => {
        updateCart((c) => {
          const i = c.findIndex((l) => l.variant_id === line.variant_id);
          if (i < 0) return [...c, line];
          const n = [...c]; n[i] = { ...n[i], quantity: Math.min(99, n[i].quantity + line.quantity) }; return n;
        });
        setOpen(null); setCartOpen(true);
      }} />}
      {cartOpen && <CartPanel cart={cart} updateCart={updateCart} onClose={() => setCartOpen(false)} />}
      {settingsOpen && <StoreSettings shop={status.shop_name} onClose={() => setSettingsOpen(false)} onChanged={() => { setSettingsOpen(false); setProducts([]); setCollections([]); refreshStatus(); }} />}
    </div>
  );
}

function Header({ shop }) {
  return (
    <div className="min-w-0">
      <h1 className="text-2xl font-bold flex items-center gap-2"><ShoppingBag className="w-6 h-6 text-primary" /> Gear Store</h1>
      <p className="text-sm text-muted-foreground mt-0.5">{shop ? `Brokerage gear from ${shop}. Checkout is secure on Shopify.` : 'Brokerage gear, right inside Guru Broker.'}</p>
    </div>
  );
}

function ProductDialog({ product: p, onClose, onAdd }) {
  const first = p.variants.find((v) => v.available) || p.variants[0];
  const [picked, setPicked] = useState(first?.options || {});
  const [qty, setQty] = useState(1);
  const variant = p.variants.find((v) => p.options.every((o) => v.options[o.name] === picked[o.name])) || (p.options.length ? null : first);
  const [img, setImg] = useState(p.image);
  useEffect(() => { if (variant?.image) setImg(variant.image); }, [variant?.image]);
  // Which choices exist with the other picks kept (so impossible combinations are dimmed).
  const possible = (name, value) => p.variants.some((v) => v.available && v.options[name] === value && p.options.every((o) => o.name === name || v.options[o.name] === picked[o.name]));
  const images = p.images.length ? p.images : p.image ? [p.image] : [];
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl p-0 overflow-hidden max-h-[92dvh] overflow-y-auto">
        <div className="grid md:grid-cols-2">
          <div className="bg-muted">
            <div className="aspect-square">{img ? <img src={img} alt={p.title} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><ShoppingBag className="w-12 h-12 text-muted-foreground/40" /></div>}</div>
            {images.length > 1 && (
              <div className="flex gap-2 p-3 overflow-x-auto">
                {images.map((u) => <button key={u} onClick={() => setImg(u)} className={cn('w-14 h-14 rounded-lg overflow-hidden flex-shrink-0 border-2', img === u ? 'border-primary' : 'border-transparent')}><img src={u} alt="" className="w-full h-full object-cover" /></button>)}
              </div>
            )}
          </div>
          <div className="p-5 sm:p-6 flex flex-col">
            <DialogHeader><DialogTitle className="text-xl leading-snug pr-6">{p.title}</DialogTitle></DialogHeader>
            <p className="mt-2 text-lg font-semibold">
              {variant ? fmt(variant.price) : priceLabel(p)}
              {variant?.compare_at && variant.compare_at.amount > variant.price.amount && <span className="ml-2 text-sm text-muted-foreground line-through font-normal">{fmt(variant.compare_at)}</span>}
            </p>
            {p.options.map((o) => (
              <div key={o.name} className="mt-4">
                <p className="text-xs font-semibold uppercase text-muted-foreground mb-1.5">{o.name}{picked[o.name] ? `: ${picked[o.name]}` : ''}</p>
                <div className="flex flex-wrap gap-2">
                  {o.values.map((v) => (
                    <button key={v} onClick={() => setPicked((x) => ({ ...x, [o.name]: v }))}
                      className={cn('min-w-[44px] rounded-lg border px-3 py-1.5 text-sm transition-colors', picked[o.name] === v ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted', !possible(o.name, v) && picked[o.name] !== v && 'opacity-40 line-through')}>{v}</button>
                  ))}
                </div>
              </div>
            ))}
            <div className="mt-5 flex items-center gap-3">
              <Qty value={qty} onChange={setQty} />
              <Button className="flex-1 rounded-xl h-11" disabled={!variant?.available}
                onClick={() => onAdd({ variant_id: variant.id, quantity: qty, title: p.title, variant_title: p.options.length ? variant.title : '', price: variant.price, image: variant.image || p.image })}>
                {!variant ? 'Pick your options' : variant.available ? 'Add to cart' : 'Sold out'}
              </Button>
            </div>
            {p.description && <p className="mt-5 text-sm text-muted-foreground whitespace-pre-line leading-relaxed">{p.description}</p>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Qty({ value, onChange, small }) {
  return (
    <div className={cn('flex items-center rounded-xl border', small ? 'h-8' : 'h-11')}>
      <button className="px-2.5 h-full text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={value <= 1} onClick={() => onChange(value - 1)} aria-label="Fewer"><Minus className="w-3.5 h-3.5" /></button>
      <span className="w-7 text-center text-sm font-medium tabular-nums">{value}</span>
      <button className="px-2.5 h-full text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={value >= 99} onClick={() => onChange(value + 1)} aria-label="More"><Plus className="w-3.5 h-3.5" /></button>
    </div>
  );
}

function CartPanel({ cart, updateCart, onClose }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const total = useMemo(() => cart.reduce((s, l) => s + (l.price?.amount || 0) * l.quantity, 0), [cart]);
  const currency = cart[0]?.price?.currency || 'USD';
  const checkout = async () => {
    // Open the tab right away (phones block tabs opened after a wait), then point it at Shopify.
    const tab = window.open('', '_blank');
    setBusy(true); setError('');
    try {
      const { checkout_url } = await store('checkout', { lines: cart.map((l) => ({ variant_id: l.variant_id, quantity: l.quantity })) });
      if (tab) tab.location.href = checkout_url; else window.location.href = checkout_url;
      updateCart(() => []); setSent(true);
    } catch (e) { tab?.close(); setError(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 z-[70] flex justify-end bg-black/40" onClick={onClose}>
      <aside className="w-full max-w-md h-[100dvh] bg-card shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <p className="font-semibold text-lg flex items-center gap-2"><ShoppingCart className="w-5 h-5" /> Your cart</p>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-muted" aria-label="Close cart"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-3 divide-y">
          {sent ? (
            <div className="py-16 text-center"><ExternalLink className="w-8 h-8 mx-auto text-primary" /><p className="mt-3 font-semibold">Checkout opened in a new tab</p><p className="text-sm text-muted-foreground mt-1">Finish paying there. Your order confirmation comes from the store by email.</p></div>
          ) : !cart.length ? <p className="py-16 text-center text-sm text-muted-foreground">Your cart is empty.</p>
            : cart.map((l) => (
              <div key={l.variant_id} className="flex gap-3 py-3">
                <div className="w-16 h-16 rounded-lg bg-muted overflow-hidden flex-shrink-0">{l.image && <img src={l.image} alt="" className="w-full h-full object-cover" />}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium leading-snug line-clamp-2">{l.title}</p>
                  {l.variant_title && <p className="text-xs text-muted-foreground">{l.variant_title}</p>}
                  <div className="mt-2 flex items-center gap-2">
                    <Qty small value={l.quantity} onChange={(q) => updateCart((c) => c.map((x) => (x.variant_id === l.variant_id ? { ...x, quantity: q } : x)))} />
                    <button className="p-1.5 text-muted-foreground hover:text-red-600" aria-label="Remove" onClick={() => updateCart((c) => c.filter((x) => x.variant_id !== l.variant_id))}><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
                <p className="text-sm font-medium tabular-nums">{fmt({ amount: (l.price?.amount || 0) * l.quantity, currency: l.price?.currency })}</p>
              </div>
            ))}
        </div>
        {!sent && cart.length > 0 && (
          <div className="border-t px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-3">
            <div className="flex justify-between font-semibold"><span>Subtotal</span><span className="tabular-nums">{fmt({ amount: total, currency })}</span></div>
            <p className="text-xs text-muted-foreground">Shipping and tax are added at checkout.</p>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button className="w-full h-11 rounded-xl gap-2" disabled={busy} onClick={checkout}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />} Checkout</Button>
          </div>
        )}
      </aside>
    </div>
  );
}

function ConnectCard({ onDone, initial }) {
  const [domain, setDomain] = useState(initial || '');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const go = async (e) => {
    e.preventDefault(); setBusy(true); setError('');
    try { await store('connect', { domain, token }); onDone(); } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={go} className="rounded-2xl border bg-card p-5 sm:p-6 space-y-4">
      <div>
        <p className="font-semibold">Connect your brokerage's Shopify store</p>
        <p className="text-sm text-muted-foreground mt-1">Your agents will shop your gear here and pay on Shopify's secure checkout. Orders land in your Shopify admin tagged with the agent's name.</p>
      </div>
      <ol className="text-sm space-y-1.5 list-decimal pl-5 text-muted-foreground">
        <li>In Shopify admin, open <b className="text-foreground">Sales channels</b> and add the free <b className="text-foreground">Headless</b> channel.</li>
        <li>In Headless, click <b className="text-foreground">Create storefront</b>.</li>
        <li>Under <b className="text-foreground">Storefront API</b>, copy the <b className="text-foreground">public access token</b>.</li>
        <li>Make sure your products are published to the Headless channel, then paste below.</li>
      </ol>
      <label className="block text-sm font-medium">Store address
        <Input className="mt-1" placeholder="yourstore.myshopify.com" value={domain} onChange={(e) => setDomain(e.target.value)} autoCapitalize="none" autoCorrect="off" />
      </label>
      <label className="block text-sm font-medium">Storefront API public access token
        <Input className="mt-1 font-mono" placeholder="Paste the token" value={token} onChange={(e) => setToken(e.target.value)} autoCapitalize="none" autoCorrect="off" />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" disabled={busy || !domain.trim() || !token.trim()} className="gap-2">{busy && <Loader2 className="w-4 h-4 animate-spin" />} Connect store</Button>
    </form>
  );
}

function StoreSettings({ shop, onClose, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [replace, setReplace] = useState(false);
  const disconnect = async () => {
    if (!window.confirm(`Disconnect ${shop}? Agents won't see the store until it's connected again.`)) return;
    setBusy(true);
    try { await store('disconnect'); onChanged(); } catch (e) { window.alert(e.message); setBusy(false); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[92dvh] overflow-y-auto">
        <DialogHeader><DialogTitle>Store settings</DialogTitle></DialogHeader>
        <p className="text-sm">Connected to <b>{shop}</b>.</p>
        <p className="text-sm text-muted-foreground">Only products published to the Headless sales channel show here. Orders arrive in your Shopify admin with the agent's name and email.</p>
        {replace ? <ConnectCard onDone={onChanged} /> : (
          <div className="flex flex-wrap gap-2 pt-2">
            <Button variant="outline" onClick={() => setReplace(true)}>Change store or token</Button>
            <Button variant="ghost" className="text-red-600" disabled={busy} onClick={disconnect}>Disconnect</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
