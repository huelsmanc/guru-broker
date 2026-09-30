// Ported from Base44 function `fetchLinkMetadata`. Logic unchanged.
import { createClientFromRequest } from '../lib/base44.js';

export default (async (req) => {
  try {
    const body = await req.json();
    const { url } = body;

    if (!url) {
      return Response.json({ error: 'URL is required' }, { status: 400 });
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      return Response.json({ error: 'Invalid URL' }, { status: 400 });
    }

    // Fetch the webpage
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LinkUnfurler/1.0)' },
    });

    if (!response.ok) {
      return Response.json({ error: 'Failed to fetch URL' }, { status: 400 });
    }

    const html = await response.text();

    // Extract Open Graph meta tags
    const titleMatch = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']*)/i);
    const descriptionMatch = html.match(/<meta\s+property=["']og:description["']\s+content=["']([^"']*)/i);
    const imageMatch = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']*)/i);

    // Fallback to standard meta tags
    const title = titleMatch?.[1] || html.match(/<title>([^<]*)<\/title>/i)?.[1] || null;
    const description = descriptionMatch?.[1] || html.match(/<meta\s+name=["']description["']\s+content=["']([^"']*)/i)?.[1] || null;
    const image = imageMatch?.[1] || null;

    // Extract domain from URL
    const domain = new URL(url).hostname;

    return Response.json({
      url,
      title: title || domain,
      description,
      image,
      domain,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});