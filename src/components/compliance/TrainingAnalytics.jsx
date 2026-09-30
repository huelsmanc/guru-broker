import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { motion } from 'framer-motion';

export default function TrainingAnalytics({ brokerageId }) {
  const { data: trainings = [] } = useQuery({
    queryKey: ['compliance-trainings-analytics', brokerageId],
    queryFn: () => base44.entities.ComplianceTraining.filter({ brokerage_id: brokerageId }, '-created_date', 100),
    enabled: !!brokerageId,
  });

  const { data: attempts = [] } = useQuery({
    queryKey: ['compliance-attempts-analytics', brokerageId],
    queryFn: () => base44.entities.ComplianceAttempt.filter({ brokerage_id: brokerageId }, '-created_date', 1000),
    enabled: !!brokerageId,
  });

  const { data: brokerageUsers = [] } = useQuery({
    queryKey: ['brokerage-users-analytics', brokerageId],
    queryFn: () => base44.entities.User.filter({ brokerage_id: brokerageId }, 'full_name', 500),
    enabled: !!brokerageId,
  });

  // Calculate completion rates per training
  const completionData = trainings.map(training => {
    const trainingAttempts = attempts.filter(a => a.training_id === training.id);
    const uniqueAgents = new Set(trainingAttempts.map(a => a.agent_email));
    const passedCount = trainingAttempts.filter(a => a.training_id === training.id && a.passed).length;
    const completionRate = brokerageUsers.length > 0 
      ? Math.round((uniqueAgents.size / brokerageUsers.length) * 100)
      : 0;
    const avgScore = trainingAttempts.length > 0
      ? Math.round(trainingAttempts.filter(a => a.training_id === training.id).reduce((sum, a) => sum + a.score, 0) / trainingAttempts.filter(a => a.training_id === training.id).length)
      : 0;

    return {
      name: training.title,
      completion: completionRate,
      avgScore,
      passCount: passedCount,
      totalAttempts: trainingAttempts.length,
    };
  });

  // Identify agents who haven't completed mandatory trainings
  const mandatoryTrainings = trainings.filter(t => t.category !== 'other');
  const agentsNotCompleted = brokerageUsers.filter(agent => {
    return mandatoryTrainings.some(training => {
      const completed = attempts.some(a => 
        a.training_id === training.id && 
        a.agent_email === agent.email && 
        a.passed
      );
      return !completed;
    });
  }).map(agent => {
    const incompleteTrainings = mandatoryTrainings.filter(training => {
      const completed = attempts.some(a => 
        a.training_id === training.id && 
        a.agent_email === agent.email && 
        a.passed
      );
      return !completed;
    });
    return { ...agent, incompleteTrainings };
  }).sort((a, b) => b.incompleteTrainings.length - a.incompleteTrainings.length);

  // Score distribution for pie chart
  const scoreRanges = {
    excellent: attempts.filter(a => a.score >= 90).length,
    good: attempts.filter(a => a.score >= 80 && a.score < 90).length,
    fair: attempts.filter(a => a.score >= 70 && a.score < 80).length,
    needsImprovement: attempts.filter(a => a.score < 70).length,
  };

  const scoreData = [
    { name: '90-100% (Excellent)', value: scoreRanges.excellent, color: '#10b981' },
    { name: '80-89% (Good)', value: scoreRanges.good, color: '#3b82f6' },
    { name: '70-79% (Fair)', value: scoreRanges.fair, color: '#f59e0b' },
    { name: '<70% (Needs Improvement)', value: scoreRanges.needsImprovement, color: '#ef4444' },
  ];

  return (
    <div className="space-y-8">
      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-2xl border border-border p-6">
          <p className="text-sm text-muted-foreground">Total Trainings</p>
          <p className="text-4xl font-bold mt-2">{trainings.length}</p>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-card rounded-2xl border border-border p-6">
          <p className="text-sm text-muted-foreground">Total Attempts</p>
          <p className="text-4xl font-bold mt-2">{attempts.length}</p>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-card rounded-2xl border border-border p-6">
          <p className="text-sm text-muted-foreground">Avg Score</p>
          <p className="text-4xl font-bold mt-2">
            {attempts.length > 0 ? Math.round(attempts.reduce((sum, a) => sum + a.score, 0) / attempts.length) : 0}%
          </p>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="bg-card rounded-2xl border border-border p-6">
          <p className="text-sm text-muted-foreground">Agents At Risk</p>
          <p className="text-4xl font-bold mt-2 text-destructive">{agentsNotCompleted.length}</p>
        </motion.div>
      </div>

      {/* Completion Rates Chart */}
      {completionData.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="bg-card rounded-2xl border border-border p-6">
          <h3 className="font-semibold text-foreground mb-4">Training Completion Rates</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={completionData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="name" stroke="var(--muted-foreground)" />
              <YAxis stroke="var(--muted-foreground)" />
              <Tooltip 
                contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px' }}
                labelStyle={{ color: 'var(--foreground)' }}
              />
              <Legend />
              <Bar dataKey="completion" fill="var(--primary)" name="Completion %" />
              <Bar dataKey="avgScore" fill="var(--accent)" name="Avg Score %" />
            </BarChart>
          </ResponsiveContainer>
        </motion.div>
      )}

      {/* Score Distribution */}
      {attempts.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="bg-card rounded-2xl border border-border p-6">
          <h3 className="font-semibold text-foreground mb-4">Score Distribution</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={scoreData.filter(d => d.value > 0)}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, value }) => `${name}: ${value}`}
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
              >
                {scoreData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </motion.div>
      )}

      {/* Agents Not Completed */}
      {agentsNotCompleted.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }} className="bg-card rounded-2xl border border-border p-6">
          <div className="flex items-center gap-2 mb-4">
            <AlertCircle className="w-5 h-5 text-destructive" />
            <h3 className="font-semibold text-foreground">Agents Not Compliant</h3>
          </div>
          <div className="space-y-3">
            {agentsNotCompleted.map((agent, i) => (
              <motion.div
                key={agent.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.6 + i * 0.05 }}
                className="bg-destructive/5 rounded-lg p-4 border border-destructive/20"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-foreground">{agent.full_name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{agent.email}</p>
                    <div className="flex gap-2 mt-2 flex-wrap">
                      {agent.incompleteTrainings.map(training => (
                        <Badge key={training.id} variant="outline" className="text-xs bg-destructive/10 text-destructive border-destructive/30">
                          {training.title}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-destructive">{agent.incompleteTrainings.length} pending</span>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}

      {agentsNotCompleted.length === 0 && mandatoryTrainings.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }} className="bg-accent/10 rounded-2xl border border-accent/20 p-6 flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-accent" />
          <p className="text-sm text-accent">All agents have completed mandatory compliance trainings!</p>
        </motion.div>
      )}
    </div>
  );
}