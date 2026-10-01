import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useChat } from '@/lib/chat/ChatProvider';
import { Conversation } from '@/pages/DirectMessages';

// The deal's private chat (agent, co-agents, TC; admins join when they open it).
export default function WorkspaceChat({ tx }) {
  const chat = useChat();
  const [group, setGroup] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    base44.functions.invoke('dealChat', { transactionId: tx.id }).then((r) => setGroup(r.data.group)).catch((e) => setError(e.message));
  }, [tx.id, tx.tc_email, JSON.stringify(tx.co_agents || [])]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => chat?.on('group_chat', ({ row }) => { if (row?.id && row.id === group?.id) setGroup((g) => ({ ...g, ...row })); }), [chat, group?.id]);
  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!group || !chat) return <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />;
  return (
    <div className="max-w-4xl h-[calc(100dvh-8rem)] lg:h-[calc(100dvh-4rem)] flex flex-col rounded-xl border bg-card overflow-hidden">
      <Conversation key={group.id} kind="group" convKey={group.id} group={group} chat={chat} embedded onBack={() => {}} />
    </div>
  );
}
