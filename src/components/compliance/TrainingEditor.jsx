// Build or edit a training. Pick how to start (AI class, AI quiz, write a class, write a quiz),
// then review everything in one editor: details, lessons (text, video link, handout) and questions.
import React, { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Sparkles, PenLine, GraduationCap, ListChecks, Plus, Trash2, ArrowUp, ArrowDown, Loader2, Paperclip, X } from 'lucide-react';

const CATS = [['fair_housing', 'Fair Housing'], ['ethics', 'Ethics'], ['compliance', 'Compliance'], ['other', 'Other']];
const blankQ = () => ({ question_text: '', options: [{ text: '', is_correct: true }, { text: '', is_correct: false }, { text: '', is_correct: false }, { text: '', is_correct: false }], explanation: '' });
const blankL = () => ({ title: '', body: '', video_url: '', file_url: '', file_name: '' });
const sel = 'mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-base md:text-sm';

function move(list, i, d) { const a = [...list]; const j = i + d; if (j < 0 || j >= a.length) return a; [a[i], a[j]] = [a[j], a[i]]; return a; }

export default function TrainingEditor({ open, onClose, trainingId }) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState('choose'); // choose | ai | edit
  const [ai, setAi] = useState({ kind: 'class', topic: '', state: '', lessons: 4, questions: 8 });
  const [t, setT] = useState(null);
  const [qs, setQs] = useState([]);
  const [busy, setBusy] = useState('');
  const [notify, setNotify] = useState(true);

  useEffect(() => {
    if (!open) return;
    setBusy('');
    if (!trainingId) { setStep('choose'); setT(null); setQs([]); setNotify(true); return; }
    setStep('edit'); setBusy('loading');
    base44.functions.invoke('training', { action: 'get', training_id: trainingId })
      .then(({ data }) => { setT({ ...data.training, lessons: data.training.lessons || [] }); setQs(data.questions.length ? data.questions : [blankQ()]); })
      .catch((e) => { window.alert(e.message); onClose(); })
      .finally(() => setBusy(''));
  }, [open, trainingId]); // eslint-disable-line react-hooks/exhaustive-deps

  const manual = (kind) => {
    setT({ title: '', description: '', category: 'compliance', passing_score: 80, minutes: '', kind, type: 'admin_created', lessons: kind === 'class' ? [blankL()] : [] });
    setQs([blankQ()]); setStep('edit');
  };
  const draft = async () => {
    if (!ai.topic.trim()) return window.alert('Describe what it should cover.');
    setBusy('draft');
    try {
      const { draft: d } = (await base44.functions.invoke('training', { action: 'draft', ...ai })).data;
      setT({ category: 'compliance', passing_score: 80, ...d });
      setQs(d.questions.length ? d.questions : [blankQ()]);
      setStep('edit');
    } catch (e) { window.alert(e.message); } finally { setBusy(''); }
  };
  const save = async () => {
    setBusy('save');
    try {
      const questions = qs.filter((q) => q.question_text.trim()).map((q) => ({ ...q, options: q.options.filter((o) => o.text.trim()) }));
      await base44.functions.invoke('training', { action: 'save', training: t, questions, notify });
      queryClient.invalidateQueries({ queryKey: ['compliance-trainings'] });
      onClose();
    } catch (e) { window.alert(e.message); } finally { setBusy(''); }
  };

  const setL = (i, patch) => setT((x) => ({ ...x, lessons: x.lessons.map((l, j) => (j === i ? { ...l, ...patch } : l)) }));
  const setQ = (i, patch) => setQs((x) => x.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  const setO = (i, k, patch) => setQs((x) => x.map((q, j) => (j !== i ? q : { ...q, options: q.options.map((o, m) => (m === k ? { ...o, ...patch } : patch.is_correct ? { ...o, is_correct: false } : o)) })));
  const upload = async (i, file) => {
    if (!file) return;
    setBusy(`file${i}`);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file, scope: { kind: 'misc' } });
      setL(i, { file_url, file_name: file.name });
    } catch (e) { window.alert(e.message); } finally { setBusy(''); }
  };

  const Choice = ({ icon: Icon, title, text, onClick }) => (
    <button onClick={onClick} className="text-left rounded-xl border p-4 hover:border-primary hover:bg-primary/5 transition-colors">
      <Icon className="w-5 h-5 text-primary mb-2" />
      <p className="font-semibold">{title}</p>
      <p className="text-sm text-muted-foreground mt-0.5">{text}</p>
    </button>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent className="w-[96vw] max-w-3xl max-h-[92dvh] overflow-y-auto">
        <DialogHeader><DialogTitle>{trainingId ? 'Edit training' : step === 'ai' ? (ai.kind === 'class' ? 'AI class' : 'AI quiz') : 'New training'}</DialogTitle></DialogHeader>

        {step === 'choose' && (
          <div className="grid sm:grid-cols-2 gap-3">
            <Choice icon={Sparkles} title="AI class" text="Lessons plus a quiz, written by AI from your topic. You review and edit before saving." onClick={() => { setAi((a) => ({ ...a, kind: 'class' })); setStep('ai'); }} />
            <Choice icon={Sparkles} title="AI quiz" text="Just questions, written by AI from your topic." onClick={() => { setAi((a) => ({ ...a, kind: 'quiz' })); setStep('ai'); }} />
            <Choice icon={GraduationCap} title="Write a class" text="Your own lessons (text, a video link, a handout), then a quiz." onClick={() => manual('class')} />
            <Choice icon={ListChecks} title="Write a quiz" text="Your own questions and answers." onClick={() => manual('quiz')} />
          </div>
        )}

        {step === 'ai' && (
          <div className="space-y-4">
            <div><Label>What should it cover?</Label>
              <Textarea className="mt-1 text-base md:text-sm" rows={4} value={ai.topic} onChange={(e) => setAi({ ...ai, topic: e.target.value })} placeholder="e.g. Fair housing for new agents: protected classes, steering, advertising, and what to say when a buyer asks about neighborhood demographics" /></div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div><Label>State (optional)</Label><Input className="mt-1" value={ai.state} onChange={(e) => setAi({ ...ai, state: e.target.value })} placeholder="e.g. Florida" /></div>
              {ai.kind === 'class' && <div><Label>Lessons</Label><select className={sel} value={ai.lessons} onChange={(e) => setAi({ ...ai, lessons: Number(e.target.value) })}>{[2, 3, 4, 5, 6, 8].map((n) => <option key={n}>{n}</option>)}</select></div>}
              <div><Label>Questions</Label><select className={sel} value={ai.questions} onChange={(e) => setAi({ ...ai, questions: Number(e.target.value) })}>{[5, 8, 10, 15, 20].map((n) => <option key={n}>{n}</option>)}</select></div>
            </div>
            <p className="text-xs text-muted-foreground">AI can get details wrong. Read it over before you save, especially anything about your state's rules.</p>
            <div className="flex justify-between gap-2">
              <Button variant="outline" onClick={() => setStep('choose')} disabled={!!busy}>Back</Button>
              <Button onClick={draft} disabled={!!busy} className="gap-2">{busy === 'draft' ? <><Loader2 className="w-4 h-4 animate-spin" /> Writing… about 30 seconds</> : <><Sparkles className="w-4 h-4" /> Write it</>}</Button>
            </div>
          </div>
        )}

        {step === 'edit' && busy === 'loading' && <div className="py-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}

        {step === 'edit' && t && busy !== 'loading' && (
          <div className="space-y-6">
            <section className="space-y-3">
              <div className="flex rounded-lg bg-muted p-1 w-fit">
                {[['class', 'Class (lessons + quiz)'], ['quiz', 'Quiz only']].map(([k, l]) => (
                  <button key={k} onClick={() => setT((x) => ({ ...x, kind: k, lessons: k === 'class' && !x.lessons?.length ? [blankL()] : x.lessons }))}
                    className={`rounded-md px-3 py-1.5 text-sm ${t.kind === k ? 'bg-background shadow font-medium' : 'text-muted-foreground'}`}>{l}</button>
                ))}
              </div>
              <div><Label>Title</Label><Input className="mt-1" value={t.title} onChange={(e) => setT({ ...t, title: e.target.value })} placeholder="e.g. Fair Housing Fundamentals" /></div>
              <div><Label>Description</Label><Input className="mt-1" value={t.description || ''} onChange={(e) => setT({ ...t, description: e.target.value })} /></div>
              <div className="grid grid-cols-3 gap-3">
                <div><Label>Category</Label><select className={sel} value={t.category || 'compliance'} onChange={(e) => setT({ ...t, category: e.target.value })}>{CATS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
                <div><Label>Pass at (%)</Label><Input className="mt-1" inputMode="numeric" value={t.passing_score ?? ''} onChange={(e) => setT({ ...t, passing_score: e.target.value.replace(/\D/g, '') })} /></div>
                <div><Label>Minutes</Label><Input className="mt-1" inputMode="numeric" value={t.minutes ?? ''} onChange={(e) => setT({ ...t, minutes: e.target.value.replace(/\D/g, '') })} placeholder="Optional" /></div>
              </div>
            </section>

            {t.kind === 'class' && (
              <section>
                <h3 className="font-semibold mb-2">Lessons</h3>
                <div className="space-y-3">
                  {t.lessons.map((l, i) => (
                    <div key={i} className="rounded-xl border p-3 space-y-2">
                      <div className="flex items-center gap-1">
                        <span className="text-xs font-medium text-muted-foreground w-6">{i + 1}.</span>
                        <Input value={l.title} onChange={(e) => setL(i, { title: e.target.value })} placeholder="Lesson title" />
                        <Button size="icon" variant="ghost" onClick={() => setT((x) => ({ ...x, lessons: move(x.lessons, i, -1) }))} disabled={i === 0} title="Move up"><ArrowUp className="w-4 h-4" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => setT((x) => ({ ...x, lessons: move(x.lessons, i, 1) }))} disabled={i === t.lessons.length - 1} title="Move down"><ArrowDown className="w-4 h-4" /></Button>
                        <Button size="icon" variant="ghost" className="text-destructive" onClick={() => setT((x) => ({ ...x, lessons: x.lessons.filter((_, j) => j !== i) }))} title="Remove lesson"><Trash2 className="w-4 h-4" /></Button>
                      </div>
                      <Textarea rows={7} className="text-base md:text-sm" value={l.body} onChange={(e) => setL(i, { body: e.target.value })} placeholder={'What agents should learn. Start a line with "- " for a bullet, and "Key takeaway:" for the summary.'} />
                      <div className="grid sm:grid-cols-2 gap-2">
                        <Input value={l.video_url || ''} onChange={(e) => setL(i, { video_url: e.target.value.trim() })} placeholder="Video link (YouTube or Vimeo), optional" />
                        {l.file_url ? (
                          <div className="flex items-center gap-2 rounded-md border px-3 text-sm min-h-10"><Paperclip className="w-4 h-4 shrink-0" /><span className="truncate flex-1">{l.file_name || 'Handout'}</span><button onClick={() => setL(i, { file_url: '', file_name: '' })} title="Remove"><X className="w-4 h-4" /></button></div>
                        ) : (
                          <label className="flex items-center gap-2 rounded-md border px-3 text-sm text-muted-foreground min-h-10 cursor-pointer hover:bg-muted/50">
                            {busy === `file${i}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />} Attach a handout (PDF, slides…)
                            <input type="file" className="hidden" onChange={(e) => upload(i, e.target.files?.[0])} />
                          </label>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <Button variant="outline" size="sm" className="mt-2 gap-1" onClick={() => setT((x) => ({ ...x, lessons: [...x.lessons, blankL()] }))}><Plus className="w-4 h-4" /> Add lesson</Button>
              </section>
            )}

            <section>
              <h3 className="font-semibold mb-1">Quiz questions</h3>
              <p className="text-xs text-muted-foreground mb-2">Tap the circle next to the correct answer.</p>
              <div className="space-y-3">
                {qs.map((q, i) => (
                  <div key={i} className="rounded-xl border p-3 space-y-2">
                    <div className="flex items-start gap-1">
                      <span className="text-xs font-medium text-muted-foreground w-6 pt-2.5">{i + 1}.</span>
                      <Textarea rows={2} className="text-base md:text-sm" value={q.question_text} onChange={(e) => setQ(i, { question_text: e.target.value })} placeholder="Question" />
                      <div className="flex flex-col">
                        <Button size="icon" variant="ghost" onClick={() => setQs((x) => move(x, i, -1))} disabled={i === 0} title="Move up"><ArrowUp className="w-4 h-4" /></Button>
                        <Button size="icon" variant="ghost" className="text-destructive" onClick={() => setQs((x) => x.filter((_, j) => j !== i))} title="Remove question"><Trash2 className="w-4 h-4" /></Button>
                      </div>
                    </div>
                    <div className="space-y-1.5 pl-6">
                      {q.options.map((o, k) => (
                        <div key={k} className="flex items-center gap-2">
                          <button onClick={() => setO(i, k, { is_correct: true })} title="Correct answer"
                            className={`w-6 h-6 shrink-0 rounded-full border-2 flex items-center justify-center ${o.is_correct ? 'border-green-600 bg-green-600' : 'border-border'}`}>{o.is_correct && <span className="w-2 h-2 rounded-full bg-white" />}</button>
                          <Input value={o.text} onChange={(e) => setO(i, k, { text: e.target.value })} placeholder={`Answer ${k + 1}`} />
                          {q.options.length > 2 && <button onClick={() => setQ(i, { options: q.options.filter((_, m) => m !== k) })} className="text-muted-foreground" title="Remove answer"><X className="w-4 h-4" /></button>}
                        </div>
                      ))}
                      {q.options.length < 6 && <button className="text-xs text-primary" onClick={() => setQ(i, { options: [...q.options, { text: '', is_correct: false }] })}>+ Add answer</button>}
                      <Input value={q.explanation || ''} onChange={(e) => setQ(i, { explanation: e.target.value })} placeholder="Why it's right (shown after they submit), optional" />
                    </div>
                  </div>
                ))}
              </div>
              <Button variant="outline" size="sm" className="mt-2 gap-1" onClick={() => setQs((x) => [...x, blankQ()])}><Plus className="w-4 h-4" /> Add question</Button>
            </section>

            <div className="flex flex-wrap items-center justify-between gap-2 sticky bottom-0 bg-background pt-3 pb-1 border-t">
              <Button variant="outline" onClick={onClose} disabled={!!busy}>Cancel</Button>
              {!trainingId && (
                <label className="flex items-center gap-2 text-sm ml-auto">
                  <input type="checkbox" className="w-4 h-4" checked={notify} onChange={(e) => setNotify(e.target.checked)} /> Let agents know
                </label>
              )}
              <Button onClick={save} disabled={!!busy} className="gap-2">{busy === 'save' ? <Loader2 className="w-4 h-4 animate-spin" /> : <PenLine className="w-4 h-4" />} {trainingId ? 'Save changes' : 'Save and publish'}</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
