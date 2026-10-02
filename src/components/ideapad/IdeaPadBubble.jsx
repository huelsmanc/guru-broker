import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lightbulb, X, Send, Search, Plus, ChevronLeft, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

// tabOnly: a slim tab on the right edge instead of the round bubble (deal pages, where the
// bubble sat on top of the Ask AI button).
export default function IdeaPadBubble({ user, tabOnly = false }) {
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [view, setView] = useState('chat'); // 'chat' | 'history'
  const [activeSession, setActiveSession] = useState(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const messagesEndRef = useRef(null);
  const queryClient = useQueryClient();

  const { data: sessions = [] } = useQuery({
    queryKey: ['ideapad-sessions', user?.email],
    queryFn: () => base44.entities.IdeaPadNote.filter({ user_email: user?.email }, '-created_date', 100),
    enabled: !!user?.email && open,
  });

  // Scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activeSession?.messages, loading]);

  const startNewSession = async () => {
    const session = await base44.entities.IdeaPadNote.create({
      user_email: user.email,
      messages: [{
        role: 'ai',
        content: "Hey! I'm your Idea Pad 💡 — share what's on your mind. I'll help you think it through, refine it, and keep it saved forever. What are you thinking about?",
        timestamp: new Date().toISOString(),
      }],
      title: 'New Idea',
    });
    setActiveSession(session);
    setView('chat');
    queryClient.invalidateQueries({ queryKey: ['ideapad-sessions', user?.email] });
  };

  const openSession = (session) => {
    setActiveSession(session);
    setView('chat');
  };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMsg = { role: 'user', content: input.trim(), timestamp: new Date().toISOString() };
    const updatedMessages = [...(activeSession?.messages || []), userMsg];

    // Optimistically update UI
    setActiveSession(prev => ({ ...prev, messages: updatedMessages }));
    setInput('');
    setLoading(true);

    // Build conversation history for AI
    const history = updatedMessages.map(m => ({
      role: m.role === 'ai' ? 'assistant' : 'user',
      content: m.content,
    }));

    const aiResponse = await base44.integrations.Core.InvokeLLM({
      prompt: `You are an enthusiastic, supportive AI idea coach for a real estate agent. Your job is to help them brainstorm, develop, and refine their ideas. Ask clarifying questions, help them think deeper, suggest angles they haven't considered, and celebrate their creativity. Keep responses concise (2-4 sentences max). Be warm and encouraging. 

Conversation history:
${history.map(m => `${m.role}: ${m.content}`).join('\n')}

Respond as the assistant:`,
    });

    const aiMsg = { role: 'ai', content: aiResponse, timestamp: new Date().toISOString() };
    const finalMessages = [...updatedMessages, aiMsg];

    // Generate a title from first user message if still default
    let title = activeSession?.title;
    if (title === 'New Idea' && userMsg.content.length > 5) {
      title = userMsg.content.slice(0, 40) + (userMsg.content.length > 40 ? '...' : '');
    }

    const updated = await base44.entities.IdeaPadNote.update(activeSession.id, {
      messages: finalMessages,
      title,
    });

    setActiveSession(updated);
    setLoading(false);
    queryClient.invalidateQueries({ queryKey: ['ideapad-sessions', user?.email] });
  };

  const filteredSessions = sessions.filter(s =>
    !searchQuery ||
    s.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.messages?.some(m => m.content?.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <>
      {/* Slim edge tab (deal pages): tap to open or close the Idea Pad. */}
      {tabOnly && (
        <button
          onClick={() => setOpen((o) => !o)}
          className={cn('fixed right-0 top-1/2 -translate-y-1/2 z-50 w-7 h-16 rounded-l-xl shadow-lg flex items-center justify-center text-white bg-gradient-to-b from-primary to-accent', open && 'opacity-90')}
          title={open ? 'Close Idea Pad' : 'Open Idea Pad'}
          aria-label={open ? 'Close Idea Pad' : 'Open Idea Pad'}
        >
          {open ? <X className="w-4 h-4" /> : <Lightbulb className="w-4 h-4" />}
        </button>
      )}

      {/* Minimized sidebar tab */}
      <AnimatePresence>
        {!tabOnly && minimized && (
          <motion.button
            initial={{ x: 80 }}
            animate={{ x: 0 }}
            exit={{ x: 80 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            onClick={() => { setMinimized(false); setOpen(true); }}
            className="fixed bottom-32 right-0 z-50 flex flex-col items-center justify-center gap-1 bg-gradient-to-b from-primary to-accent text-white rounded-l-xl px-2 py-4 shadow-lg cursor-pointer"
            style={{ writingMode: 'vertical-rl' }}
            title="Open Idea Pad"
          >
            <Lightbulb className="w-4 h-4 mb-1" style={{ writingMode: 'horizontal-tb' }} />
            <span className="text-[11px] font-semibold tracking-wide" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
              💡 I'm here!
            </span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Floating bubble button */}
      {!tabOnly && !minimized && (
      <motion.button
        onClick={() => {
          if (open) { setOpen(false); setMinimized(true); }
          else setOpen(true);
        }}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
        className={cn('fixed bottom-24 right-4 lg:bottom-6 lg:right-6 z-50 w-14 h-14 rounded-full bg-gradient-to-br from-primary to-accent shadow-lg flex items-center justify-center text-white')}
        title="Idea Pad"
      >
        {open ? <X className="w-6 h-6" /> : <Lightbulb className="w-6 h-6" />}
      </motion.button>
      )}

      {/* Chat panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            className={cn('fixed bottom-44 right-4 lg:bottom-24 lg:right-6 z-50 w-[360px] max-w-[calc(100vw-24px)] h-[520px] max-h-[calc(100dvh-14rem)] bg-card border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden')}
          >
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-primary to-accent text-white flex-shrink-0">
              {view === 'chat' && activeSession ? (
                <button onClick={() => setView('history')} className="p-1 rounded hover:bg-white/20 transition-colors">
                  <ChevronLeft className="w-4 h-4" />
                </button>
              ) : null}
              <Lightbulb className="w-5 h-5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm">Idea Pad</p>
                <p className="text-[10px] text-white/70 truncate">
                  {view === 'chat' && activeSession ? activeSession.title : 'Your AI brainstorm partner'}
                </p>
              </div>
              <button
                onClick={() => { setView('history'); setActiveSession(null); }}
                className="p-1 rounded hover:bg-white/20 transition-colors"
                title="All ideas"
              >
                <Search className="w-4 h-4" />
              </button>
              <button
                onClick={startNewSession}
                className="p-1 rounded hover:bg-white/20 transition-colors"
                title="New idea"
              >
                <Plus className="w-4 h-4" />
              </button>
              <button
                onClick={() => { setOpen(false); setMinimized(true); }}
                className="p-1 rounded hover:bg-white/20 transition-colors"
                title="Minimize"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* History view */}
            {view === 'history' && (
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="px-3 pt-3 pb-2 flex-shrink-0">
                  <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2">
                    <Search className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                    <input
                      type="text"
                      placeholder="Search your ideas..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      className="bg-transparent outline-none text-sm flex-1 placeholder:text-muted-foreground/50"
                    />
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2">
                  {filteredSessions.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center py-10">
                      <Lightbulb className="w-8 h-8 text-muted-foreground/30 mb-2" />
                      <p className="text-sm text-muted-foreground">No ideas yet.</p>
                      <button onClick={startNewSession} className="mt-3 text-sm text-primary font-medium hover:underline">
                        Start your first idea →
                      </button>
                    </div>
                  ) : (
                    filteredSessions.map(session => (
                      <button
                        key={session.id}
                        onClick={() => openSession(session)}
                        className="w-full text-left bg-background border border-border rounded-xl px-3 py-3 hover:border-primary/40 hover:bg-primary/5 transition-all"
                      >
                        <p className="text-sm font-semibold text-foreground truncate">{session.title || 'Untitled'}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {session.messages?.length || 0} messages ·{' '}
                          {session.created_date ? format(new Date(session.created_date), 'MMM d, yyyy') : ''}
                        </p>
                        {session.messages?.filter(m => m.role === 'user').slice(-1)[0]?.content && (
                          <p className="text-xs text-muted-foreground/70 mt-1 truncate">
                            {session.messages.filter(m => m.role === 'user').slice(-1)[0].content}
                          </p>
                        )}
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Chat view */}
            {view === 'chat' && (
              <>
                {!activeSession ? (
                  <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                    <Lightbulb className="w-10 h-10 text-primary/30 mb-3" />
                    <p className="text-sm font-medium text-foreground mb-1">What's on your mind?</p>
                    <p className="text-xs text-muted-foreground mb-4">Start a new idea or pick one from your history.</p>
                    <button
                      onClick={startNewSession}
                      className="bg-primary text-primary-foreground text-sm font-medium px-4 py-2 rounded-xl hover:bg-primary/90 transition-colors"
                    >
                      ✨ New Idea Session
                    </button>
                  </div>
                ) : (
                  <>
                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
                      {activeSession.messages?.map((msg, idx) => (
                        <div
                          key={idx}
                          className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}
                        >
                          <div
                            className={cn(
                              'max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-relaxed',
                              msg.role === 'user'
                                ? 'bg-primary text-primary-foreground rounded-br-sm'
                                : 'bg-muted text-foreground rounded-bl-sm'
                            )}
                          >
                            {msg.content}
                          </div>
                        </div>
                      ))}
                      {loading && (
                        <div className="flex justify-start">
                          <div className="bg-muted rounded-2xl rounded-bl-sm px-3 py-2">
                            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                          </div>
                        </div>
                      )}
                      <div ref={messagesEndRef} />
                    </div>

                    {/* Input */}
                    <div className="px-3 py-3 border-t border-border flex-shrink-0">
                      <div className="flex items-end gap-2">
                        <textarea
                          value={input}
                          onChange={e => setInput(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              sendMessage();
                            }
                          }}
                          placeholder="Share your idea..."
                          rows={1}
                          className="flex-1 resize-none bg-muted rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground/60 max-h-24"
                        />
                        <button
                          onClick={sendMessage}
                          disabled={!input.trim() || loading}
                          className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center text-white hover:bg-primary/90 transition-colors disabled:opacity-40 flex-shrink-0"
                        >
                          <Send className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}