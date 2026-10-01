// New: the public key browsers need to subscribe to push notifications.
import { createClientFromRequest } from '../lib/base44.js';
import { pushTo, vapidKeys } from '../lib/push.js';

export default async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    const { test } = await req.json().catch(() => ({}));
    if (test) {
      const sent = await pushTo(base44.asServiceRole.entities, [me.email], { title: 'Notifications are on', body: "You'll get messages, mentions and calls here.", url: '/Dashboard', tag: 'test' });
      return Response.json({ sent });
    }
    const { publicKey } = await vapidKeys();
    return Response.json({ configured: true, publicKey });
  } catch (error) {
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
};
