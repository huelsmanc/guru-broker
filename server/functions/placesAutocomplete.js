// New: address suggestions while typing (Google Places API (New)), through our server so the
// key stays private. Signed-in people only.
//   { action: 'suggest', input, session } -> { suggestions: [{ id, text, main, secondary }] }
//   { action: 'details', id, session }    -> { address, lat, lng }  (full address with ZIP)
import { createClientFromRequest } from '../lib/base44.js';

const API = 'https://places.googleapis.com/v1';

export default async (req) => {
  try {
    await createClientFromRequest(req).auth.me();
    const key = (process.env.GOOGLE_MAPS_API_KEY || '').trim();
    if (!key) return Response.json({ suggestions: [], problem: 'GOOGLE_MAPS_API_KEY is not set.' });
    const { action, input, id, session } = await req.json().catch(() => ({}));
    const sessionToken = String(session || '').slice(0, 64) || undefined;

    if (action === 'suggest') {
      const text = String(input || '').trim().slice(0, 120);
      if (text.length < 3) return Response.json({ suggestions: [] });
      const res = await fetch(`${API}/places:autocomplete`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'X-Goog-Api-Key': key },
        body: JSON.stringify({ input: text, includedRegionCodes: ['us'], sessionToken }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error('placesAutocomplete:', res.status, data?.error?.message);
        return Response.json({ suggestions: [], problem: data?.error?.message || `Google said ${res.status}` });
      }
      const suggestions = (data.suggestions || []).map((s) => s.placePrediction).filter(Boolean).slice(0, 6).map((p) => ({
        id: p.placeId,
        text: p.text?.text || '',
        main: p.structuredFormat?.mainText?.text || p.text?.text || '',
        secondary: p.structuredFormat?.secondaryText?.text || '',
      }));
      return Response.json({ suggestions });
    }

    if (action === 'details') {
      if (!/^[\w-]{10,300}$/.test(String(id || ''))) return Response.json({ error: 'Bad place' }, { status: 400 });
      const u = new URL(`${API}/places/${id}`);
      if (sessionToken) u.searchParams.set('sessionToken', sessionToken);
      const res = await fetch(u, { headers: { 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'formattedAddress,location' } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return Response.json({ error: data?.error?.message || `Google said ${res.status}` }, { status: 502 });
      return Response.json({ address: String(data.formattedAddress || '').replace(/, USA$/, ''), lat: data.location?.latitude ?? null, lng: data.location?.longitude ?? null });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message, suggestions: [] }, { status: error.status || 500 });
  }
};
