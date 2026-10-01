import React, { useState, useRef, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Mic, MicOff, Send, RotateCcw, Loader2, Volume2, VolumeX } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import RolePlay from '@/components/coach/RolePlay';

const SYSTEM_PROMPT = `You are an elite real estate sales coach with 20+ years of experience. You specialize in:
- Handling buyer and seller objections (price, timing, loyalty to other agents, market fears, etc.)
- Cold call scripts and prospecting techniques
- Converting FSBOs, expired listings, and cold leads
- Building rapport and trust with clients
- Negotiation strategies
- Scripts for every stage of the sales process

Your style is direct, practical, and motivating. When an agent presents an objection or scenario:
1. Acknowledge it briefly
2. Give them 2-3 specific word-for-word scripts they can use
3. Explain the psychology behind why it works
4. Offer to role-play or go deeper if they want

Keep responses conversational and actionable. Use bold for key phrases agents should actually say. Ask follow-up questions to keep the coaching going.`;

const STARTER_PROMPTS = [
  { emoji: '😤', text: 'My seller thinks their home is worth more than the comps show' },
  { emoji: '📞', text: 'Help me write a cold call script for expired listings' },
  { emoji: '🤝', text: 'A buyer says they want to wait for prices to drop' },
  { emoji: '🏠', text: 'FSBO says they don\'t need an agent' },
  { emoji: '💸', text: 'Buyer says your commission is too high' },
  { emoji: '⏳', text: 'Prospect says "we\'re just looking for now"' },
];

function CoachChat({ user }) {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: `Hey ${user?.full_name?.split(' ')[0] || 'there'}! 👋 I'm your AI Sales Coach. I'm here to help you crush objections, build killer cold call scripts, and sharpen your sales game.\n\nWhat are you dealing with today? You can **type or use the mic** to talk to me — just like a real coaching session.`,
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const messagesEndRef = useRef(null);
  const recognitionRef = useRef(null);
  const textareaRef = useRef(null);

  const speechSupported = typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);
  const ttsSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const speak = (text) => {
    if (!ttsEnabled || !ttsSupported) return;
    window.speechSynthesis.cancel();
    const clean = text.replace(/\*\*/g, '').replace(/\*/g, '').replace(/#{1,3} /g, '');
    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.rate = 1.05;
    utterance.pitch = 1;
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(v => v.name.includes('Google') && v.lang === 'en-US') || voices.find(v => v.lang === 'en-US');
    if (preferred) utterance.voice = preferred;
    window.speechSynthesis.speak(utterance);
  };

  const startListening = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (e) => {
      const transcript = e.results[0][0].transcript;
      setInput(prev => prev ? prev + ' ' + transcript : transcript);
      setListening(false);
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    recognition.start();
    recognitionRef.current = recognition;
    setListening(true);
  };

  const stopListening = () => {
    recognitionRef.current?.stop();
    setListening(false);
  };

  const sendMessage = async (content) => {
    const text = content || input.trim();
    if (!text || loading) return;

    const userMsg = { role: 'user', content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setLoading(true);

    const history = newMessages.map(m => `${m.role === 'assistant' ? 'Coach' : 'Agent'}: ${m.content}`).join('\n\n');

    const response = await base44.integrations.Core.InvokeLLM({
      prompt: `${SYSTEM_PROMPT}\n\nConversation so far:\n${history}\n\nCoach:`,
    });

    const aiMsg = { role: 'assistant', content: response };
    setMessages(prev => [...prev, aiMsg]);
    setLoading(false);
    speak(response);
  };

  const reset = () => {
    window.speechSynthesis?.cancel();
    setMessages([
      {
        role: 'assistant',
        content: `Fresh start! 💪 What objection or sales scenario do you want to tackle?`,
      },
    ]);
    setInput('');
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center text-xl">
            🎯
          </div>
          <div>
            <h1 className="font-bold text-foreground">AI Sales Coach</h1>
            <p className="text-xs text-muted-foreground">Objection handler · Cold call scripts · Role-play</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {ttsSupported && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setTtsEnabled(!ttsEnabled); window.speechSynthesis?.cancel(); }}
              className={cn('gap-1.5 rounded-xl h-9 text-xs', ttsEnabled && 'border-accent text-accent')}
              title={ttsEnabled ? 'Disable voice responses' : 'Enable voice responses'}
            >
              {ttsEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              {ttsEnabled ? 'Voice On' : 'Voice Off'}
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={reset} className="gap-1.5 rounded-xl h-9 text-xs">
            <RotateCcw className="w-3.5 h-3.5" /> New Session
          </Button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 lg:px-8 py-6 space-y-4 max-w-4xl mx-auto w-full">
        <AnimatePresence initial={false}>
          {messages.map((msg, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className={cn('flex gap-3', msg.role === 'user' ? 'justify-end' : 'justify-start')}
            >
              {msg.role === 'assistant' && (
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center text-lg flex-shrink-0 mt-0.5">
                  🎯
                </div>
              )}
              <div
                className={cn(
                  'max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed',
                  msg.role === 'user'
                    ? 'bg-primary text-primary-foreground rounded-br-sm'
                    : 'bg-card border border-border text-foreground rounded-bl-sm'
                )}
              >
                {msg.role === 'assistant' ? (
                  <ReactMarkdown
                    className="prose prose-sm max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 prose-p:leading-relaxed prose-strong:text-primary"
                    components={{
                      p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                      strong: ({ children }) => <strong className="font-semibold text-primary">{children}</strong>,
                      ul: ({ children }) => <ul className="my-2 ml-4 list-disc space-y-1">{children}</ul>,
                      ol: ({ children }) => <ol className="my-2 ml-4 list-decimal space-y-1">{children}</ol>,
                      li: ({ children }) => <li className="text-sm">{children}</li>,
                    }}
                  >
                    {msg.content}
                  </ReactMarkdown>
                ) : (
                  <p>{msg.content}</p>
                )}
              </div>
              {msg.role === 'user' && (
                <div className="w-9 h-9 rounded-xl bg-primary/20 flex items-center justify-center font-bold text-primary flex-shrink-0 mt-0.5 text-sm">
                  {user?.full_name?.[0]?.toUpperCase() || 'A'}
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>

        {loading && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex gap-3 justify-start"
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center text-lg flex-shrink-0">
              🎯
            </div>
            <div className="bg-card border border-border rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </motion.div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Starter prompts — only show on first message */}
      {messages.length === 1 && (
        <div className="px-4 lg:px-8 pb-3 max-w-4xl mx-auto w-full">
          <p className="text-xs text-muted-foreground mb-2 font-medium">Quick starts:</p>
          <div className="flex flex-wrap gap-2">
            {STARTER_PROMPTS.map((p, i) => (
              <button
                key={i}
                onClick={() => sendMessage(p.text)}
                className="text-xs bg-card border border-border rounded-xl px-3 py-2 hover:border-primary/40 hover:bg-primary/5 transition-all text-left"
              >
                {p.emoji} {p.text}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="px-4 lg:px-8 py-4 border-t border-border bg-card flex-shrink-0">
        <div className="max-w-4xl mx-auto flex items-end gap-3">
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
              }}
              placeholder={listening ? '🎙️ Listening...' : 'Describe an objection or scenario...'}
              rows={1}
              className={cn(
                'w-full resize-none bg-background border border-border rounded-2xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground/60 max-h-32 transition-all',
                listening && 'border-destructive/50 bg-destructive/5'
              )}
            />
          </div>

          {speechSupported && (
            <Button
              onClick={listening ? stopListening : startListening}
              variant="outline"
              size="icon"
              className={cn(
                'h-12 w-12 rounded-2xl flex-shrink-0 transition-all',
                listening && 'border-destructive text-destructive bg-destructive/10 animate-pulse'
              )}
              title={listening ? 'Stop recording' : 'Speak your question'}
            >
              {listening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </Button>
          )}

          <Button
            onClick={() => sendMessage()}
            disabled={!input.trim() || loading}
            className="h-12 w-12 rounded-2xl flex-shrink-0 bg-primary hover:bg-primary/90 p-0"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          </Button>
        </div>
        {speechSupported && (
          <p className="text-center text-xs text-muted-foreground mt-2">
            🎙️ Voice input supported — tap the mic and speak your question
          </p>
        )}
      </div>
    </div>
  );
}
// Two ways to train: talk it out with a character (voice role-play) or ask the coach.
export default function SalesCoach() {
  const { user } = useOutletContext();
  const [tab, setTab] = useState('roleplay');
  return (
    <div className="flex flex-col h-[100dvh]">
      <div className="flex-shrink-0 border-b bg-card px-4 py-2 flex items-center gap-1">
        {[['roleplay', 'Voice role-play'], ['chat', 'Ask the coach']].map(([k, l]) => (
          <button key={k} type="button" onClick={() => setTab(k)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${tab === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}>{l}</button>
        ))}
      </div>
      <div className="flex-1 min-h-0">{tab === 'roleplay' ? <RolePlay user={user} /> : <CoachChat user={user} />}</div>
    </div>
  );
}
