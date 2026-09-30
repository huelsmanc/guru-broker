// Old emailed links pointed here. They now open the signing page, which uses the same
// layout as the field editor so every box lines up.
import { appUrl } from '../lib/base44.js';

export default async (req) => {
  const token = new URL(req.url).searchParams.get('token') || '';
  return new Response(null, { status: 302, headers: { Location: `${appUrl()}/sign?token=${encodeURIComponent(token)}` } });
};
