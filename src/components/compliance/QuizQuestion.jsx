import React from 'react';
import { motion } from 'framer-motion';

export default function QuizQuestion({ question, selectedAnswer, onSelectAnswer }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div>
        <h3 className="text-lg font-semibold text-foreground mb-4">{question.question_text}</h3>
        <div className="space-y-2">
          {question.options.map((option, idx) => (
            <button
              key={idx}
              onClick={() => onSelectAnswer(option.text)}
              className={`w-full p-4 rounded-xl border-2 transition-all text-left ${
                selectedAnswer === option.text
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50 bg-muted/30'
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                    selectedAnswer === option.text
                      ? 'border-primary bg-primary'
                      : 'border-border'
                  }`}
                >
                  {selectedAnswer === option.text && (
                    <div className="w-2 h-2 bg-white rounded-full" />
                  )}
                </div>
                <span className="font-medium text-foreground">{option.text}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </motion.div>
  );
}