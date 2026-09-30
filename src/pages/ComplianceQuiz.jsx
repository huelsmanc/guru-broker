import React, { useState, useEffect } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { ArrowLeft, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import QuizQuestion from '@/components/compliance/QuizQuestion';
import MobilePageHeader from '@/components/layout/MobilePageHeader';

export default function ComplianceQuiz() {
  const { user, brokerageId } = useOutletContext();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const urlParams = new URLSearchParams(window.location.search);
  const trainingId = urlParams.get('training_id');
  
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState(null);

  const { data: training } = useQuery({
    queryKey: ['training', trainingId],
    queryFn: () => base44.entities.ComplianceTraining.filter({ id: trainingId }),
    enabled: !!trainingId,
    select: (data) => data[0],
  });

  const { data: questions = [] } = useQuery({
    queryKey: ['quiz-questions', trainingId],
    queryFn: () => base44.entities.ComplianceQuestion.filter({ training_id: trainingId }, 'order', 100),
    enabled: !!trainingId,
  });

  const saveAttempt = useMutation({
    mutationFn: async (attemptData) => {
      return base44.entities.ComplianceAttempt.create(attemptData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compliance-attempts'] });
    },
  });

  const handleSelectAnswer = (questionId, answer) => {
    if (!submitted) {
      setAnswers({
        ...answers,
        [questionId]: answer,
      });
    }
  };

  const handleSubmitQuiz = async () => {
    const answeredCount = Object.keys(answers).length;
    if (answeredCount !== questions.length) {
      alert(`Please answer all ${questions.length} questions before submitting.`);
      return;
    }

    let correctCount = 0;
    const answerDetails = questions.map((q) => {
      const userAnswer = answers[q.id];
      const isCorrect = q.options.find(opt => opt.text === userAnswer)?.is_correct || false;
      if (isCorrect) correctCount++;
      return {
        question_id: q.id,
        selected_answer: userAnswer,
        is_correct: isCorrect,
      };
    });

    const percentage = Math.round((correctCount / questions.length) * 100);
    const passed = percentage >= (training?.passing_score || 80);

    setScore(percentage);
    setSubmitted(true);

    await saveAttempt.mutate({
      brokerage_id: brokerageId,
      training_id: trainingId,
      agent_email: user.email,
      agent_name: user.full_name,
      score: percentage,
      passed,
      answers: answerDetails,
      completed_at: new Date().toISOString(),
    });
  };

  if (!training || questions.length === 0) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (submitted) {
    const passed = score >= (training.passing_score || 80);
    return (
      <div className="p-6 lg:p-10 max-w-2xl mx-auto flex items-center justify-center min-h-screen">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center"
        >
          <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 ${passed ? 'bg-accent/20' : 'bg-destructive/20'}`}>
            {passed ? (
              <CheckCircle2 className="w-12 h-12 text-accent" />
            ) : (
              <AlertCircle className="w-12 h-12 text-destructive" />
            )}
          </div>
          <h1 className="text-3xl font-bold text-foreground mb-2">
            {passed ? 'Congratulations!' : 'Try Again'}
          </h1>
          <p className="text-muted-foreground mb-6">
            {passed ? `You passed with ${score}%` : `You scored ${score}%. You need ${training.passing_score}% to pass.`}
          </p>
          <div className="flex gap-3 justify-center">
            <Button variant="outline" onClick={() => navigate('/ComplianceTraining')} className="rounded-xl h-11">
              Back to Trainings
            </Button>
            {!passed && (
              <Button
                onClick={() => {
                  setCurrentQuestion(0);
                  setAnswers({});
                  setSubmitted(false);
                  setScore(null);
                }}
                className="rounded-xl h-11"
              >
                Retake Quiz
              </Button>
            )}
          </div>
        </motion.div>
      </div>
    );
  }

  const question = questions[currentQuestion];
  const progress = ((currentQuestion + 1) / questions.length) * 100;

  return (
    <>
    <MobilePageHeader title="Quiz" />
    <div className="p-6 lg:p-10 max-w-2xl mx-auto">
      <Button
        variant="ghost"
        onClick={() => navigate('/ComplianceTraining')}
        className="gap-2 mb-6 hidden lg:flex"
      >
        <ArrowLeft className="w-4 h-4" /> Back
      </Button>

      <div className="bg-card rounded-2xl border border-border p-6">
        <div className="mb-6">
          <div className="flex justify-between items-center mb-2">
            <h2 className="font-semibold text-foreground">{training.title}</h2>
            <span className="text-sm text-muted-foreground">
              Question {currentQuestion + 1} of {questions.length}
            </span>
          </div>
          <div className="w-full bg-muted rounded-full h-2">
            <motion.div
              className="bg-primary h-2 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        </div>

        <QuizQuestion
          question={question}
          selectedAnswer={answers[question.id]}
          onSelectAnswer={(answer) => handleSelectAnswer(question.id, answer)}
        />

        <div className="flex gap-3 mt-8">
          <Button
            variant="outline"
            onClick={() => setCurrentQuestion(Math.max(0, currentQuestion - 1))}
            disabled={currentQuestion === 0}
            className="rounded-xl"
          >
            Previous
          </Button>
          {currentQuestion < questions.length - 1 ? (
            <Button
              onClick={() => setCurrentQuestion(currentQuestion + 1)}
              className="flex-1 rounded-xl"
            >
              Next
            </Button>
          ) : (
            <Button
              onClick={handleSubmitQuiz}
              className="flex-1 rounded-xl bg-accent hover:bg-accent/90"
            >
              Submit Quiz
            </Button>
          )}
        </div>
      </div>
    </div>
    </>
  );
}