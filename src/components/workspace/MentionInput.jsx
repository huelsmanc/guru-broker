import React, { useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';

// Comment box with @mentions. Type "@" and a name, pick a person, and they're notified
// (in the app and by email) when the comment is posted.
// people: [{ email, name }]; onPost(text, mentionEmails)
export default function MentionInput({ people = [], onPost, placeholder = 'Comment… type @ to mention someone', busy }) {
  const [text, setText] = useState('');
  const [picked, setPicked] = useState([]); // [{ email, name }]
  const [query, setQuery] = useState(null); // text after "@" while choosing
  const [hi, setHi] = useState(0);
  const ref = useRef(null);

  const matches = useMemo(() => {
    if (query == null) return [];
    const q = query.toLowerCase();
    return people.filter((p) => `${p.name} ${p.email}`.toLowerCase().includes(q)).slice(0, 6);
  }, [people, query]);

  const onChange = (e) => {
    const v = e.target.value;
    setText(v);
    const upto = v.slice(0, e.target.selectionStart);
    const m = upto.match(/(?:^|\s)@([\w.'-]*)$/);
    setQuery(m ? m[1] : null);
    setHi(0);
  };

  const choose = (p) => {
    const el = ref.current;
    const caret = el?.selectionStart ?? text.length;
    const before = text.slice(0, caret).replace(/@([\w.'-]*)$/, `@${p.name} `);
    setText(before + text.slice(caret));
    setPicked((x) => (x.some((y) => y.email === p.email) ? x : [...x, p]));
    setQuery(null);
    setTimeout(() => { el?.focus(); el?.setSelectionRange(before.length, before.length); }, 0);
  };

  const post = () => {
    if (!text.trim()) return;
    const emails = picked.filter((p) => text.includes(`@${p.name}`)).map((p) => p.email);
    onPost(text.trim(), emails);
    setText(''); setPicked([]); setQuery(null);
  };

  const onKeyDown = (e) => {
    if (matches.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => (h + 1) % matches.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => (h - 1 + matches.length) % matches.length); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); choose(matches[hi]); return; }
      if (e.key === 'Escape') { setQuery(null); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); post(); }
  };

  return (
    <div className="relative">
      <div className="flex gap-2">
        <textarea ref={ref} rows={2} value={text} onChange={onChange} onKeyDown={onKeyDown} placeholder={placeholder}
          className="flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        <Button size="sm" className="self-end" disabled={!text.trim() || busy} onClick={post}>Post</Button>
      </div>
      {query != null && matches.length === 0 && (
        <p className="absolute z-20 left-0 bottom-full mb-1 w-72 rounded-md border bg-popover shadow-lg px-3 py-2 text-xs text-muted-foreground">
          {people.length ? 'No one by that name.' : 'No one to mention yet.'} You can mention the agents and TC on this deal, and admins.
        </p>
      )}
      {matches.length > 0 && (
        <ul className="absolute z-20 left-0 bottom-full mb-1 w-72 rounded-md border bg-popover shadow-lg py-1">
          {matches.map((p, i) => (
            <li key={p.email}>
              <button type="button" onMouseDown={(e) => { e.preventDefault(); choose(p); }}
                className={`w-full text-left px-3 py-1.5 text-sm ${i === hi ? 'bg-muted' : ''}`}>
                <span className="font-medium">{p.name}</span> <span className="text-xs text-muted-foreground">{p.email}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Shows a comment with @Name mentions highlighted. */
export function CommentText({ text, mentions = [] }) {
  if (!mentions.length) return <p className="whitespace-pre-wrap">{text}</p>;
  const names = mentions.map((m) => m.name).sort((a, b) => b.length - a.length).map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const parts = String(text).split(new RegExp(`(@(?:${names.join('|')}))`, 'g'));
  return <p className="whitespace-pre-wrap">{parts.map((p, i) => (p.startsWith('@') && names.some((n) => new RegExp(`^@${n}$`).test(p)) ? <span key={i} className="rounded bg-emerald-100 text-emerald-800 px-1">{p}</span> : p))}</p>;
}
