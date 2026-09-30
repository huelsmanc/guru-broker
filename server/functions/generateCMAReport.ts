// CMA report. When MLS data is synced, comparables are real sales from the MLS and AI
// picks the best ones and explains adjustments. Without MLS data it falls back to the
// original web-search version (flagged so agents know to verify it).
import { createClientFromRequest } from '../lib/base44.js';
import { findSubject, findComps, compSummary } from '../lib/comps.js';
import { InvokeLLM } from '../lib/integrations.js';

async function mlsCma({ address, propertyDetails }) {
  const subject = (await findSubject({ address, mls_number: propertyDetails?.mls_number })) || {};
  const zip = String(address).match(/\b\d{5}\b/)?.[0];
  const comps = await findComps({
    subject, zip,
    city: subject.city || String(address).split(',')[1]?.trim(),
    beds: propertyDetails?.bedrooms ?? subject.beds,
    sqft: propertyDetails?.sqft ?? subject.living_area,
  });
  if (comps.length < 3) return null;
  const list = comps.map(compSummary);
  const ai = await InvokeLLM({
    max_tokens: 3000,
    system: 'You are a residential appraiser-minded listing agent. Use only the comparable sales provided. Be concrete with dollar adjustments.',
    response_json_schema: {
      type: 'object',
      properties: {
        chosen: { type: 'array', items: { type: 'object', properties: {
          id: { type: 'string' }, adjustment: { type: 'number', description: 'net $ adjustment to compare with the subject' }, notes: { type: 'string' },
        }, required: ['id', 'adjustment', 'notes'] } },
        marketAnalysis: { type: 'object', properties: {
          avgPricePerSqft: { type: 'number' }, avgDaysOnMarket: { type: 'number' }, marketTrend: { type: 'string' },
          marketCondition: { type: 'string' }, recommendedPriceRange: { type: 'string' }, priceAdjustments: { type: 'string' },
        } },
        rehabAssessment: { type: 'string' },
        summary: { type: 'string' },
      },
      required: ['chosen', 'marketAnalysis', 'summary'],
    },
    prompt: `Subject: ${address}
Beds ${propertyDetails?.bedrooms ?? subject.beds ?? '?'}, baths ${propertyDetails?.bathrooms ?? subject.baths_total ?? '?'}, sqft ${subject.living_area ?? '?'}, year built ${subject.year_built ?? '?'}.
Agent notes: ${propertyDetails?.notes || 'none'}

Recent MLS sales (JSON):
${JSON.stringify(list)}

Pick the 4-6 most comparable sales, give each a net dollar adjustment toward the subject with a short reason, then give the market analysis and a recommended list price range for the subject.`,
  });
  const byId = new Map(list.map((c) => [c.id, c]));
  const comparables = (ai.chosen || []).map((c) => {
    const base = byId.get(c.id);
    return base ? { ...base, adjustment: c.adjustment, adjustedPrice: base.soldPrice + (c.adjustment || 0), notes: c.notes, condition: '', upgrades: [] } : null;
  }).filter(Boolean);
  if (comparables.length < 3) return null;
  return { comparables, marketAnalysis: ai.marketAnalysis, rehabAssessment: ai.rehabAssessment || '', summary: ai.summary, source: 'mls', subject: subject.id ? { mls_number: subject.mls_number, status: subject.status } : null };
}

export default (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { address, propertyDetails, brokerageId } = await req.json();

    if (!address || !brokerageId) {
      return Response.json({ error: 'Missing address or brokerageId' }, { status: 400 });
    }

    try {
      const fromMls = await mlsCma({ address, propertyDetails });
      if (fromMls) return Response.json(fromMls);
    } catch (err) {
      console.error('MLS CMA failed, falling back to web search:', err.message);
    }

    // No MLS data for this area: fall back to web search (verify these comps).
    const searchPrompt = `Find recent comparable property sales near "${address}" for a ${propertyDetails?.bedrooms || '3'} bed, ${propertyDetails?.bathrooms || '2'} bath property.

Return JSON with:
- comparables: Array of 4-6 recent sales with address, soldPrice, listPrice, beds, baths, sqft, daysOnMarket, soldDate
- marketAnalysis: avgPricePerSqft, avgDaysOnMarket, marketCondition, marketTrend, recommendedPriceRange
- rehabAssessment: Text assessment of property condition in the area
- summary: Brief 1-2 sentence summary`;

    let cmaData;
    try {
      cmaData = await base44.integrations.Core.InvokeLLM({
        prompt: searchPrompt,
        add_context_from_internet: true,
        response_json_schema: {
          type: 'object',
          properties: {
            comparables: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  address: { type: 'string' },
                  soldPrice: { type: 'number' },
                  listPrice: { type: 'number' },
                  daysOnMarket: { type: 'number' },
                  beds: { type: 'number' },
                  baths: { type: 'number' },
                  sqft: { type: 'number' },
                  condition: { type: 'string' },
                  upgrades: { type: 'array', items: { type: 'string' } },
                  notes: { type: 'string' },
                  photoUrl: { type: 'string' },
                  soldDate: { type: 'string' }
                }
              }
            },
            marketAnalysis: {
              type: 'object',
              properties: {
                avgPricePerSqft: { type: 'number' },
                avgDaysOnMarket: { type: 'number' },
                marketTrend: { type: 'string' },
                marketCondition: { type: 'string' },
                recommendedPriceRange: { type: 'string' },
                priceAdjustments: { type: 'string' }
              }
            },
            rehabAssessment: { type: 'string' },
            summary: { type: 'string' }
          }
        }
      });
    } catch (err) {
      console.error('LLM API error:', err);
      return Response.json({ 
        error: 'AI service error - please try again in a moment',
      }, { status: 500 });
    }

    // Build response with fallbacks
    const processedData = {
      comparables: (cmaData?.comparables && Array.isArray(cmaData.comparables) && cmaData.comparables.length > 0) ? cmaData.comparables : [],
      marketAnalysis: cmaData?.marketAnalysis || {
        avgPricePerSqft: 0,
        avgDaysOnMarket: 0,
        marketCondition: 'Market data pending',
        marketTrend: 'Unable to determine',
        recommendedPriceRange: 'Contact broker for estimate',
        priceAdjustments: 'Analysis in progress'
      },
      rehabAssessment: cmaData?.rehabAssessment || 'Assessment pending',
      summary: cmaData?.summary || 'CMA analysis complete',
      source: 'web',
    };

    // Ensure we have comparables
    if (!processedData.comparables || processedData.comparables.length === 0) {
      return Response.json({ 
        error: 'No comparable properties found - try a different location',
      }, { status: 500 });
    }

    return Response.json(processedData);
  } catch (error) {
    console.error('CMA generation error:', error);
    return Response.json({ error: error.message || 'Failed to generate CMA report' }, { status: 500 });
  }
});