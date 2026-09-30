import { createClient } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const { templateId, submitters, brokerageId } = body;

    if (!templateId || !submitters || submitters.length === 0 || !brokerageId) {
      return Response.json({
        success: false,
        error: 'Missing required fields: templateId, submitters, brokerageId'
      }, { status: 400 });
    }

    const appId = Deno.env.get('BASE44_APP_ID');
    const apiKey = Deno.env.get('BASE44_API_KEY');

    if (!appId) {
      return Response.json({
        success: false,
        error: 'Server configuration error'
      }, { status: 500 });
    }

    const base44 = createClient({
      appId,
      apiKey: apiKey || undefined,
    });

    // Create submission
    const submission = await base44.asServiceRole.entities.ESignSubmission.create({
      brokerage_id: brokerageId,
      template_id: templateId,
      status: 'pending',
    });

    // Create submitter records
    for (let i = 0; i < submitters.length; i++) {
      await base44.asServiceRole.entities.ESignSubmitter.create({
        submission_id: submission.id,
        email: submitters[i].email.toLowerCase().trim(),
        order: submitters[i].order || 0,
        signed: false,
      });
    }

    return Response.json({
      success: true,
      data: {
        submissionId: submission.id,
        submitterCount: submitters.length,
      },
    });
  } catch (error) {
    console.error('createSubmission error:', error);
    return Response.json({
      success: false,
      error: error.message || 'Internal server error'
    }, { status: 500 });
  }
});