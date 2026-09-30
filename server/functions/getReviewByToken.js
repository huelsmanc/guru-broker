// Ported from Base44 function `getReviewByToken`. Logic unchanged.
import { createClientFromRequest } from '../lib/base44.js';

export default (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { token } = await req.json();

    if (!token) {
      return Response.json({ error: 'No token provided' }, { status: 400 });
    }

    const reviews = await base44.asServiceRole.entities.ClientReview.filter({ review_token: token });
    
    if (!reviews || reviews.length === 0) {
      return Response.json({ error: 'Review not found' }, { status: 404 });
    }

    return Response.json({ review: reviews[0] });
  } catch (error) {
    console.error('Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});