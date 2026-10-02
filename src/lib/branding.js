// The brokerage's name, logo and colors. Remembered on the device so they appear instantly
// (no flash of the default Guru Broker look), then refreshed quietly in the background.
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

const KEY = 'gbh-brand';

export function cachedBrand(brokerageId) {
  try {
    const b = JSON.parse(localStorage.getItem(KEY) || 'null');
    return b && (!brokerageId || b.id === brokerageId) ? b : null;
  } catch { return null; }
}
function remember(b) { try { localStorage.setItem(KEY, JSON.stringify(b)); } catch { /* private mode */ } }

const hsl = (hex) => {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex || ''));
  if (!m) return null;
  const [r, g, b] = [m[1], m[2], m[3]].map((x) => parseInt(x, 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) / 6 : max === g ? ((b - r) / d + 2) / 6 : ((r - g) / d + 4) / 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
};

/** Sets the brokerage colors on the page (or goes back to the defaults when it has none). */
export function applyBrandColors(b) {
  const root = document.documentElement.style;
  const p = hsl(b?.primary_color), s = hsl(b?.sidebar_color);
  if (p) root.setProperty('--primary', p); else root.removeProperty('--primary');
  if (s) root.setProperty('--sidebar-background', s); else root.removeProperty('--sidebar-background');
}

/** On start-up, before anything is drawn: use the colors saved on this device. */
export function applyCachedBrand() { const b = cachedBrand(); if (b) applyBrandColors(b); }

/** Brand for the signed-in person's brokerage: instant from the device, then refreshed. */
export function useBranding(brokerageId) {
  const { data } = useQuery({
    queryKey: ['branding', brokerageId],
    enabled: !!brokerageId,
    initialData: () => cachedBrand(brokerageId) || undefined,
    initialDataUpdatedAt: 0, // still check for changes once per visit
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const [settings, brokerage] = await Promise.all([
        base44.entities.BrokerageSettings.filter({ brokerage_id: brokerageId }).then((r) => r[0] || {}).catch(() => ({})),
        base44.entities.Brokerage.filter({ id: brokerageId }).then((r) => r[0] || {}).catch(() => ({})),
      ]);
      const b = {
        id: brokerageId,
        name: brokerage.name || settings.brokerage_name || null,
        broker_name: settings.broker_name || null,
        logo_url: brokerage.logo_url || null,
        primary_color: settings.primary_color || null,
        sidebar_color: settings.sidebar_color || null,
      };
      remember(b);
      applyBrandColors(b);
      return b;
    },
  });
  return data || null;
}
