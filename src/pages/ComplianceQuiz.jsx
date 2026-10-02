// Taking a training: a class shows its lessons first, then the quiz; a quiz goes straight to the
// questions. Grading happens on the server; a pass earns a broker-signed certificate.
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { ArrowLeft, CheckCircle2, AlertCircle, Award, Loader2, XCircle, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import MobilePageHeader from '@/components/layout/MobilePageHeader';
import LessonView from '@/components/compliance/LessonView';
import { openCertificate } from '@/components/compliance/certificate';

const KEY = (id) => `gbh-lesson-${id}`;

export default function ComplianceQuiz() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const params = new URLSearchParams(window.location.search);
  const trainingId = params.get('training_id');

  const { data, isLoading, error } = useQuery({
    queryKey: ['training-start', trainingId],
    enabled: !!trainingId,
    staleTime: 0,
    queryFn: async () => (await base44.functions.invoke('training', { action: 'start', training_id: trainingId })).data,
  });
  const training = data?.training;
  const questions = data?.questions || [];
  const lessons = training?.lessons || [];

  // stage: 'lesson' | 'quiz' | 'result'
  const [stage, setStage] = useState(null);
  const [lesson, setLesson] = useState(0);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!training || stage) return;
    const wantQuiz = params.get('mode') === 'quiz' || !lessons.length;
    let saved = 0; try { saved = Number(localStorage.getItem(KEY(training.id)) || 0); } catch { /* ignore */ }
    setLesson(Math.min(saved, Math.max(lessons.length - 1, 0)));
    setStage(wantQuiz ? 'quiz' : 'lesson');
  }, [training]); // eslint-disable-line react-hooks/exhaustive-deps

  const goLesson = (i) => {
    setLesson(i);
    try { localStorage.setItem(KEY(training.id), String(i)); } catch { /* ignore */ }
    window.scrollTo({ top: 0 });
  };

  const submit = async () => {
    if (questions.some((q) => !Number.isInteger(answers[q.id]))) return window.alert(`Answer all ${questions.length} questions first.`);
    setBusy(true);
    try {
      const r = (await base44.functions.invoke('training', { action: 'submit', training_id: training.id, answers })).data;
      setResult(r); setStage('result'); window.scrollTo({ top: 0 });
      queryClient.invalidateQueries({ queryKey: ['compliance-attempts'] });
      if (r.passed) { try { localStorage.removeItem(KEY(training.id)); } catch { /* ignore */ } }
    } catch (err) { window.alert(err.message); } finally { setBusy(false); }
  };
  const retake = () => { setAnswers({}); setCurrent(0); setResult(null); setStage('quiz'); window.scrollTo({ top: 0 }); };

  if (error) return <div className="p-8 text-sm">{error.message}</div>;
  if (isLoading || !training || !stage) {
    return <div className="flex justify-center pt-[25vh]"><Loader2 className="w-7 h-7 animate-spin text-muted-foreground" /></div>;
  }

  const back = (
    <Button variant="ghost" onClick={() => navigate('/ComplianceTraining')} className="gap-2 mb-4 hidden lg:flex"><ArrowLeft className="w-4 h-4" /> Back to trainings</Button>
  );
  const bar = (n, of) => (
    <div className="w-full bg-muted rounded-full h-2"><div className="bg-primary h-2 rounded-full transition-all" style={{ width: `${(n / of) * 100}%` }} /></div>
  );

  // ---------------------------------------------------------------- lessons
  if (stage === 'lesson') {
    const l = lessons[lesson];
    const lastLesson = lesson === lessons.length - 1;
    return (
      <>
        <MobilePageHeader title={training.title} />
        <div className="p-4 md:p-8 max-w-3xl mx-auto">
          {back}
          <div className="mb-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">{training.title} · Lesson {lesson + 1} of {lessons.length}</p>
            {bar(lesson + 1, lessons.length + 1)}
          </div>
          <div className="bg-card rounded-2xl border p-5 md:p-7">
            <h1 className="text-xl md:text-2xl font-bold mb-4">{l.title || `Lesson ${lesson + 1}`}</h1>
            <LessonView lesson={l} />
          </div>
          <div className="flex gap-3 mt-5">
            <Button variant="outline" className="rounded-xl h-11" disabled={lesson === 0} onClick={() => goLesson(lesson - 1)}>Previous</Button>
            {lastLesson
              ? <Button className="flex-1 rounded-xl h-11" onClick={() => { setStage('quiz'); window.scrollTo({ top: 0 }); }} disabled={!questions.length}>Take the quiz ({questions.length} questions)</Button>
              : <Button className="flex-1 rounded-xl h-11" onClick={() => goLesson(lesson + 1)}>Next lesson</Button>}
          </div>
          <div className="flex flex-wrap gap-1.5 mt-5">
            {lessons.map((x, i) => (
              <button key={i} onClick={() => goLesson(i)} className={`rounded-full px-3 py-1 text-xs border ${i === lesson ? 'bg-primary text-primary-foreground border-primary' : 'text-muted-foreground'}`}>{i + 1}. {String(x.title || '').slice(0, 28)}</button>
            ))}
          </div>
        </div>
      </>
    );
  }

  // ---------------------------------------------------------------- result
  if (stage === 'result' && result) {
    const byId = Object.fromEntries(result.results.map((r) => [r.question_id, r]));
    return (
      <>
        <MobilePageHeader title="Results" />
        <div className="p-4 md:p-8 max-w-2xl mx-auto">
          {back}
          <div className="bg-card rounded-2xl border p-6 text-center">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${result.passed ? 'bg-accent/20' : 'bg-destructive/15'}`}>
              {result.passed ? <CheckCircle2 className="w-10 h-10 text-accent" /> : <AlertCircle className="w-10 h-10 text-destructive" />}
            </div>
            <h1 className="text-2xl font-bold">{result.passed ? 'You passed!' : 'Not quite'}</h1>
            <p className="text-muted-foreground mt-1">{result.passed ? `You scored ${result.score}%.` : `You scored ${result.score}%. You need ${result.passing_score}% to pass.`}</p>
            <div className="flex flex-wrap justify-center gap-2 mt-5">
              {result.passed && <Button className="gap-2 rounded-xl h-11" onClick={() => openCertificate(result.attempt_id)}><Award className="w-4 h-4" /> Get my certificate</Button>}
              {!result.passed && lessons.length > 0 && <Button variant="outline" className="gap-2 rounded-xl h-11" onClick={() => { setStage('lesson'); goLesson(0); }}><BookOpen className="w-4 h-4" /> Review the lessons</Button>}
              {!result.passed && <Button className="rounded-xl h-11" onClick={retake}>Try again</Button>}
              <Button variant="outline" className="rounded-xl h-11" onClick={() => navigate('/ComplianceTraining')}>Back to trainings</Button>
            </div>
          </div>
          <h2 className="font-semibold mt-6 mb-2">Your answers</h2>
          <div className="space-y-3">
            {questions.map((q, i) => {
              const r = byId[q.id];
              return (
                <div key={q.id} className="bg-card rounded-xl border p-4">
                  <p className="font-medium text-sm flex gap-2">{r?.correct ? <CheckCircle2 className="w-4 h-4 text-accent shrink-0 mt-0.5" /> : <XCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />}{i + 1}. {q.question_text}</p>
                  {!r?.correct && <p className="text-sm mt-2 ml-6"><span className="text-muted-foreground">Correct answer: </span>{q.options[r?.correct_index]}</p>}
                  {r?.explanation && <p className="text-sm text-muted-foreground mt-1 ml-6">{r.explanation}</p>}
                </div>
              );
            })}
          </div>
        </div>
      </>
    );
  }

  // ---------------------------------------------------------------- quiz
  if (!questions.length) return <div className="p-8 text-sm text-muted-foreground">This training has no questions yet.</div>;
  const q = questions[current];
  const last = current === questions.length - 1;
  return (
    <>
      <MobilePageHeader title="Quiz" />
      <div className="p-4 md:p-8 max-w-2xl mx-auto">
        {back}
        <div className="bg-card rounded-2xl border p-5 md:p-6">
          <div className="mb-5">
            <div className="flex justify-between items-center gap-3 mb-2">
              <h2 className="font-semibold truncate">{training.title}</h2>
              <span className="text-sm text-muted-foreground shrink-0">{current + 1} of {questions.length}</span>
            </div>
            {bar(current + 1, questions.length)}
          </div>
          <h3 className="text-lg font-semibold mb-4">{q.question_text}</h3>
          <div className="space-y-2">
            {q.options.map((text, idx) => {
              const on = answers[q.id] === idx;
              return (
                <button key={idx} onClick={() => setAnswers((a) => ({ ...a, [q.id]: idx }))}
                  className={`w-full p-4 rounded-xl border-2 text-left transition-colors ${on ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 bg-muted/30'}`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-5 h-5 shrink-0 rounded-full border-2 flex items-center justify-center ${on ? 'border-primary bg-primary' : 'border-border'}`}>{on && <div className="w-2 h-2 bg-white rounded-full" />}</div>
                    <span className="font-medium">{text}</span>
                  </div>
                </button>
              );
            })}
          </div>
          <div className="flex gap-3 mt-6">
            <Button variant="outline" className="rounded-xl h-11" disabled={current === 0} onClick={() => setCurrent(current - 1)}>Previous</Button>
            {last
              ? <Button className="flex-1 rounded-xl h-11" disabled={busy} onClick={submit}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Submit'}</Button>
              : <Button className="flex-1 rounded-xl h-11" onClick={() => setCurrent(current + 1)}>Next</Button>}
          </div>
        </div>
        {lessons.length > 0 && <button className="mt-4 text-sm text-primary" onClick={() => setStage('lesson')}>Back to the lessons</button>}
      </div>
    </>
  );
}
