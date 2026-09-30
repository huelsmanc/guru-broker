import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { address, propertyDetails, brokerageId } = await req.json();

    if (!address || !brokerageId) {
      return Response.json({ error: 'Missing address or brokerageId' }, { status: 400 });
    }

    // Use InvokeLLM with web search to find comparable properties
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
      summary: cmaData?.summary || 'CMA analysis complete'
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