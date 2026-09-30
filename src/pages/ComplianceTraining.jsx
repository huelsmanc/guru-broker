import React, { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { BookOpen, Plus, Award } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import TrainingList from '@/components/compliance/TrainingList';
import CreateTrainingDialog from '@/components/compliance/CreateTrainingDialog';
import TrainingAnalytics from '@/components/compliance/TrainingAnalytics';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { isAdminRole, normalizeRole, can } from '../../shared/permissions.generated.js';

export default function ComplianceTraining() {
  const { user, brokerageId } = useOutletContext();
  const isAdmin = isAdminRole(user?.role);
  const [showCreate, setShowCreate] = useState(false);

  const { data: trainings = [] } = useQuery({
    queryKey: ['compliance-trainings', brokerageId],
    queryFn: () => base44.entities.ComplianceTraining.filter({ brokerage_id: brokerageId }, '-created_date', 100),
    enabled: !!brokerageId,
  });

  const { data: attempts = [] } = useQuery({
    queryKey: ['compliance-attempts', brokerageId, user?.email],
    queryFn: () => base44.entities.ComplianceAttempt.filter({ 
      brokerage_id: brokerageId, 
      agent_email: user?.email 
    }, '-created_date', 500),
    enabled: !!brokerageId && !!user?.email,
  });

  // Get passed trainings for badges
  const passedTrainings = new Set(attempts.filter(a => a.passed).map(a => a.training_id));

  return (
    <div className="p-6 lg:p-10 max-w-6xl mx-auto">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <BookOpen className="w-7 h-7 text-primary" />
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-foreground tracking-tight">Compliance Training</h1>
            <p className="text-muted-foreground text-sm mt-0.5">Complete trainings to earn certification badges</p>
          </div>
        </div>
        {isAdmin && (
          <Button onClick={() => setShowCreate(true)} className="gap-2 rounded-xl h-11">
            <Plus className="w-4 h-4" /> New Training
          </Button>
        )}
      </motion.div>

      {!isAdmin && (
        <>
          {/* Badges earned */}
          {passedTrainings.size > 0 && (
            <div className="bg-accent/10 border border-accent/20 rounded-2xl p-6 mb-8">
              <div className="flex items-center gap-2 mb-4">
                <Award className="w-5 h-5 text-accent" />
                <h3 className="font-semibold text-accent">Certifications Earned</h3>
              </div>
              <div className="flex flex-wrap gap-3">
                {trainings
                  .filter(t => passedTrainings.has(t.id))
                  .map((training) => (
                    <div key={training.id} className="bg-accent/20 rounded-lg px-4 py-2 text-sm font-medium text-accent flex items-center gap-2">
                      <Award className="w-4 h-4" />
                      {training.title}
                    </div>
                  ))}
              </div>
            </div>
          )}

          <TrainingList trainings={trainings} passedTrainings={passedTrainings} isAdmin={isAdmin} />
        </>
      )}

      {isAdmin && (
        <>
          <Tabs defaultValue="trainings" className="w-full">
            <TabsList className="mb-6">
              <TabsTrigger value="trainings">Trainings</TabsTrigger>
              <TabsTrigger value="analytics">Analytics</TabsTrigger>
            </TabsList>

            <TabsContent value="trainings">
              <TrainingList trainings={trainings} passedTrainings={passedTrainings} isAdmin={isAdmin} />
            </TabsContent>

            <TabsContent value="analytics">
              <TrainingAnalytics brokerageId={brokerageId} />
            </TabsContent>
          </Tabs>

          <CreateTrainingDialog open={showCreate} onClose={() => setShowCreate(false)} brokerageId={brokerageId} />
        </>
      )}
    </div>
  );
}