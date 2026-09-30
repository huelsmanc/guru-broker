import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { CheckCircle, Circle, Plus, Trash2, ListChecks } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function TransactionChecklist({ tx, isAdmin, user, onUpdate }) {
  const checklist = tx.checklist || [];
  const [newTask, setNewTask] = useState('');
  const [adding, setAdding] = useState(false);
  const [showInput, setShowInput] = useState(false);

  const completed = checklist.filter(t => t.completed).length;
  const total = checklist.length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  const saveChecklist = async (updated) => {
    await base44.entities.Transaction.update(tx.id, { checklist: updated });
    onUpdate();
  };

  const toggleTask = async (idx) => {
    const task = checklist[idx];
    const nowCompleting = !task.completed;
    const updated = checklist.map((t, i) =>
      i === idx
        ? { ...t, completed: nowCompleting, completed_by: nowCompleting ? user.full_name : null, completed_at: nowCompleting ? new Date().toISOString() : null }
        : t
    );
    await saveChecklist(updated);
    if (nowCompleting) {
      base44.functions.invoke('notifyTransactionActivity', {
        type: 'task_completed',
        transaction: tx,
        actor: { email: user.email, full_name: user.full_name, taskTitle: task.title },
      });
    }
  };

  const addTask = async () => {
    if (!newTask.trim()) return;
    setAdding(true);
    const updated = [...checklist, { id: Date.now().toString(), title: newTask.trim(), completed: false, completed_by: null, completed_at: null }];
    await saveChecklist(updated);
    setNewTask('');
    setAdding(false);
    setShowInput(false);
  };

  const deleteTask = async (idx) => {
    const updated = checklist.filter((_, i) => i !== idx);
    await saveChecklist(updated);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
            <ListChecks className="w-3.5 h-3.5" /> Checklist
          </p>
          {total > 0 && (
            <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${pct === 100 ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground'}`}>
              {completed}/{total}
            </span>
          )}
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowInput(v => !v)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border bg-background border-border/40 hover:bg-muted text-muted-foreground transition-all"
          >
            <Plus className="w-3 h-3" /> Add Task
          </button>
        )}
      </div>

      {/* Progress bar */}
      {total > 0 && (
        <div className="w-full h-1.5 bg-muted rounded-full mb-3 overflow-hidden">
          <motion.div
            className={`h-full rounded-full ${pct === 100 ? 'bg-green-500' : 'bg-primary'}`}
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.4 }}
          />
        </div>
      )}

      {/* Add task input */}
      <AnimatePresence>
        {showInput && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex gap-2 mb-2 overflow-hidden"
          >
            <input
              autoFocus
              value={newTask}
              onChange={e => setNewTask(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addTask(); if (e.key === 'Escape') setShowInput(false); }}
              placeholder="e.g. Order title, Upload inspection report..."
              className="flex-1 bg-muted border border-border/50 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
            />
            <button
              onClick={addTask}
              disabled={adding || !newTask.trim()}
              className="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium disabled:opacity-50 hover:bg-primary/90 transition-colors"
            >
              {adding ? '...' : 'Add'}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Task list */}
      {checklist.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">
          {isAdmin ? 'No tasks yet. Add tasks to track progress.' : 'No checklist tasks defined yet.'}
        </p>
      ) : (
        <div className="space-y-1.5">
          {checklist.map((task, idx) => (
            <div key={task.id || idx} className="flex items-start gap-2 group">
              <button
                onClick={() => toggleTask(idx)}
                className={`mt-0.5 flex-shrink-0 transition-colors ${task.completed ? 'text-green-500' : 'text-muted-foreground hover:text-primary'}`}
              >
                {task.completed
                  ? <CheckCircle className="w-4 h-4" />
                  : <Circle className="w-4 h-4" />
                }
              </button>
              <div className="flex-1 min-w-0">
                <span className={`text-sm ${task.completed ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                  {task.title}
                </span>
                {task.completed && task.completed_by && (
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    ✓ {task.completed_by}
                  </p>
                )}
              </div>
              {isAdmin && (
                <button
                  onClick={() => deleteTask(idx)}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all flex-shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}