// Ported from Base44 function `submitReview`. Logic unchanged.
import { createClientFromRequest } from '../lib/base44.js';

export default (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { reviewId, rating, comment } = await req.json();

    if (!reviewId || !rating) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    await base44.asServiceRole.entities.ClientReview.update(reviewId, {
      rating,
      comment,
      status: 'submitted'
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error('Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});