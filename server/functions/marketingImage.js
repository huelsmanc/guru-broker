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
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1',
        prompt: `${String(prompt).slice(0, 900)}. Photographic, high quality, real estate marketing background. No text, no letters, no logos, no watermarks, no people's faces in focus.`,
        size: SIZES[shape] || SIZES.portrait,
        n: 1,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return Response.json({ error: `Image AI: ${data.error?.message || res.status}` }, { status: 502 });
    const b64 = data.data?.[0]?.b64_json;
    if (!b64) return Response.json({ error: 'No image came back' }, { status: 502 });
    const { file_url } = await UploadFile({ file: Buffer.from(b64, 'base64'), filename: 'ai-background.png', content_type: 'image/png' });
    return Response.json({ url: file_url });
  } catch (error) {
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
};
