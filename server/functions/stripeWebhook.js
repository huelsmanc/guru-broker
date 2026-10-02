// New: Stripe tells us a print order was paid. Add this endpoint in Stripe (Developers > Webhooks):
// https://YOUR-DOMAIN/api/fn/stripeWebhook, event checkout.session.completed, and put its
// signing secret in Vercel as STRIPE_WEBHOOK_SECRET.
import { verifyStripeSignature, markPaidAndFulfill } from '../lib/print.js';

export default async (req) => {
  try {
    const raw = await req.text();
    if (!verifyStripeSignature(raw, req.headers.get('stripe-signature'))) return Response.json({ error: 'bad signature' }, { status: 400 });
    const event = JSON.parse(raw);
    if (['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type)) {
      const s = event.data?.object || {};
      const orderId = s.metadata?.order_id || s.client_reference_id;
      if (orderId && s.payment_status === 'paid') await markPaidAndFulfill(orderId, { paidVia: 'stripe' });
    }
    return Response.json({ received: true });
  } catch (error) {
    console.error('stripeWebhook:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
};
