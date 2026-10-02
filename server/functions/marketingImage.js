// New: an AI-made background or lifestyle image (ChatGPT image model) for designs that
// don't use listing photos. Never used for text or logos; those are added by the template.
import { createClientFromRequest } from '../lib/base44.js';
import { UploadFile } from '../lib/integrations.js';

const SIZES = { square: '1024x1024', portrait: '1024x1536', landscape: '1536x1024' };

export default async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    await base44.auth.me();
    if (!process.env.OPENAI_API_KEY) return Response.json({ error: 'AI images need OPENAI_API_KEY in Vercel.' }, { status: 400 });
    const { prompt, shape = 'portrait' } = await req.json();
    if (!prompt || String(prompt).length < 5) return Response.json({ error: 'Describe the image' }, { status: 400 });
    // The image service sometimes has a hiccup (or is busy): try once more, and stop before the
    // app's 60-second limit so people get a clear message instead of a crash.
    const started = Date.now();
    const model = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1';
    const ask = async (quality) => {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), Math.max(5000, 55000 - (Date.now() - started)));
      try {
        const r = await fetch('https://api.openai.com/v1/images/generations', {
          method: 'POST', signal: ctl.signal,
          headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            prompt: `${String(prompt).slice(0, 900)}. Photographic, high quality, real estate marketing background. No text, no letters, no logos, no watermarks, no people's faces in focus.`,
            size: SIZES[shape] || SIZES.portrait,
            ...(model.startsWith('gpt-image') ? { quality } : {}),
            n: 1,
          }),
        });
        return { res: r, data: await r.json().catch(() => ({})) };
      } catch (e) {
        if (e.name === 'AbortError') return { timedOut: true };
        throw e;
      } finally { clearTimeout(timer); }
    };
    let { res, data, timedOut } = await ask('medium');
    if (!timedOut && res && (res.status >= 500 || res.status === 429) && Date.now() - started < 25000) ({ res, data, timedOut } = await ask('low'));
    if (timedOut) return Response.json({ error: 'The image AI is slow right now. Give it a minute and try again.' }, { status: 503 });
    if (!res.ok) {
      const m = String(data.error?.message || '');
      console.error('marketingImage:', res.status, m);
      const friendly = /safety|moderation|policy|rejected/i.test(m) ? "The image AI wouldn't make that one. Try describing the scene differently (no people or brand names)."
        : res.status === 429 ? 'The image AI is busy (or out of credit). Try again in a minute; if it keeps happening, check the OpenAI account billing.'
        : res.status === 401 ? 'The OpenAI key in Vercel was not accepted.'
        : res.status >= 500 ? 'The image AI had a hiccup on its end. Try again.'
        : `Image AI: ${m || res.status}`;
      return Response.json({ error: friendly }, { status: res.status === 400 ? 400 : 502 });
    }
    const b64 = data.data?.[0]?.b64_json;
    if (!b64) return Response.json({ error: 'No image came back' }, { status: 502 });
    const { file_url } = await UploadFile({ file: Buffer.from(b64, 'base64'), filename: 'ai-background.png', content_type: 'image/png' });
    return Response.json({ url: file_url });
  } catch (error) {
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
};
