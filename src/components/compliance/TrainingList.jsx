import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, Clock, Trash2, Pencil, Award, GraduationCap, ListChecks } from 'lucide-react';
import { openCertificate } from './certificate';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export default function TrainingList({ trainings, passedTrainings, passes = {}, isAdmin, onEdit }) {
  const queryClient = useQueryClient();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(null);

  const deleteTraining = useMutation({
    mutationFn: (trainingId) => base44.functions.invoke('training', { action: 'delete', training_id: trainingId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compliance-trainings'] });
      setDeleteDialogOpen(null);
    },
  });
  if (trainings.length === 0) {
    return (
      <div className="text-center py-16">
        <Clock className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
        <p className="text-muted-foreground">No trainings available yet.</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-4">
        {trainings.map((training, i) => {
          const isPassed = passedTrainings.has(training.id);
          const isClass = training.kind === 'class';
          const pass = passes[training.id];
          return (
            <motion.div
              key={training.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="bg-card rounded-2xl border border-border p-5 flex flex-col sm:flex-row sm:items-center gap-4"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  {isClass ? <GraduationCap className="w-4 h-4 text-primary shrink-0" /> : <ListChecks className="w-4 h-4 text-primary shrink-0" />}
                  <h3 className="font-semibold text-foreground">{training.title}</h3>
                  {isPassed && (
                    <Badge className="gap-1 bg-accent/20 text-accent border-accent/30 text-xs">
                      <CheckCircle className="w-3 h-3" /> Certified
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">{training.description}</p>
                <div className="flex items-center gap-3 mt-2 flex-wrap">
                  <Badge variant="outline" className="text-xs capitalize">{String(training.category || 'compliance').replace('_', ' ')}</Badge>
                  <Badge variant="secondary" className="text-xs">{isClass ? `Class · ${(training.lessons || []).length} lessons` : 'Quiz'}</Badge>
                  {isAdmin && <Badge variant="secondary" className="text-xs">{training.type === 'ai_generated' ? 'AI' : 'Written by you'}</Badge>}
                  <span className="text-xs text-muted-foreground">Pass: {training.passing_score ?? 80}%{training.minutes ? ` · ${training.minutes} min` : ''}</span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {pass && (
                  <Button className="rounded-xl h-11 gap-1.5" onClick={() => openCertificate(pass.id)}>
                    <Award className="w-4 h-4" /> Certificate
                  </Button>
                )}
                <Link to={`/ComplianceQuiz?training_id=${training.id}`}>
                  <Button variant={isPassed ? "outline" : "default"} className="rounded-xl h-11">
                    {isClass ? (isPassed ? 'Review class' : 'Start class') : (isPassed ? 'Retake quiz' : 'Start quiz')}
                  </Button>
                </Link>
                {isAdmin && onEdit && (
                  <Button variant="ghost" size="icon" className="rounded-xl" onClick={() => onEdit(training.id)} title="Edit training">
                    <Pencil className="w-4 h-4" />
                  </Button>
                )}
                {isAdmin && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="rounded-xl text-destructive hover:text-destructive"
                    onClick={() => setDeleteDialogOpen(training.id)}
                    title="Delete training"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      <AlertDialog open={!!deleteDialogOpen} onOpenChange={() => setDeleteDialogOpen(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Training</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this training? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex gap-3">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTraining.mutate(deleteDialogOpen)}
              disabled={deleteTraining.isPending}
              className="bg-destructive hover:bg-destructive/90"
            >
              {deleteTraining.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}