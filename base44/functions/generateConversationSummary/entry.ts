import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { conversationId, brokerageId } = await req.json();

    if (!conversationId || !brokerageId) {
      return Response.json({ error: 'Missing conversationId or brokerageId' }, { status: 400 });
    }

    // Get all messages in conversation
    const messages = await base44.entities.Message.filter({ conversation_id: conversationId }, 'created_date', 500);
    
    if (messages.length === 0) {
      return Response.json({ error: 'No messages found' }, { status: 400 });
    }

    // Build conversation text
    const conversationText = messages
      .map(m => `${m.sender_name}: ${m.content}`)
      .join('\n\n');

    // Generate summary
    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `Summarize this conversation. Highlight key action items and decisions made. Format as:

SUMMARY:
[Brief 2-3 sentence overview]

ACTION ITEMS:
- [Item 1]
- [Item 2]
etc.

DECISIONS:
- [Decision 1]
- [Decision 2]
etc.

CONVERSATION:
${conversationText}`,
    });

    // Save summary to conversation
    await base44.entities.Conversation.update(conversationId, {
      summary: result || 'Unable to generate summary',
    });

    return Response.json({ success: true, summary: result });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});