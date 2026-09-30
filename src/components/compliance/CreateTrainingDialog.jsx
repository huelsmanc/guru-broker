import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function CreateTrainingDialog({ open, onClose, brokerageId }) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState('admin');
  const [adminForm, setAdminForm] = useState({
    title: '',
    description: '',
    category: 'fair_housing',
    passing_score: 80,
  });
  const [aiForm, setAiForm] = useState({
    title: '',
    topic: '',
    category: 'fair_housing',
    passing_score: 80,
  });
  const [generating, setGenerating] = useState(false);

  const createTraining = useMutation({
    mutationFn: async (data) => {
      return base44.entities.ComplianceTraining.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compliance-trainings'] });
      onClose();
      setAdminForm({ title: '', description: '', category: 'fair_housing', passing_score: 80 });
    },
  });

  const handleCreateAdmin = async () => {
    if (!adminForm.title) return;
    await createTraining.mutate({
      ...adminForm,
      brokerage_id: brokerageId,
      type: 'admin_created',
    });
  };

  const handleGenerateAI = async () => {
    if (!aiForm.title || !aiForm.topic) return;
    setGenerating(true);

    try {
      const prompt = `Create 5 multiple choice quiz questions about "${aiForm.topic}" for real estate compliance training (${aiForm.category.replace('_', ' ')}). 
      Return as JSON array with this format: [{"question": "...", "options": ["A", "B", "C", "D"], "correct_index": 0, "explanation": "..."}]`;

      const result = await base44.integrations.Core.InvokeLLM({
        prompt,
        response_json_schema: {
          type: 'object',
          properties: {
            questions: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  question: { type: 'string' },
                  options: { type: 'array', items: { type: 'string' } },
                  correct_index: { type: 'integer' },
                  explanation: { type: 'string' },
                },
              },
            },
          },
        },
      });

      const training = await base44.entities.ComplianceTraining.create({
        title: aiForm.title,
        description: `AI-generated training on ${aiForm.topic}`,
        category: aiForm.category,
        passing_score: aiForm.passing_score,
        brokerage_id: brokerageId,
        type: 'ai_generated',
      });

      // Create questions
      for (let i = 0; i < result.questions.length; i++) {
        const q = result.questions[i];
        const options = q.options.map((text, idx) => ({
          text,
          is_correct: idx === q.correct_index,
        }));

        await base44.entities.ComplianceQuestion.create({
          training_id: training.id,
          question_text: q.question,
          question_type: 'multiple_choice',
          options,
          explanation: q.explanation,
          order: i,
        });
      }

      queryClient.invalidateQueries({ queryKey: ['compliance-trainings'] });
      onClose();
      setAiForm({ title: '', topic: '', category: 'fair_housing', passing_score: 80 });
    } catch (error) {
      console.error('Error generating quiz:', error);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Training</DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList className="w-full">
            <TabsTrigger value="admin" className="flex-1">Admin Created</TabsTrigger>
            <TabsTrigger value="ai" className="flex-1">AI Generated</TabsTrigger>
          </TabsList>

          <TabsContent value="admin" className="space-y-4 py-4">
            <div>
              <Label>Title *</Label>
              <Input
                value={adminForm.title}
                onChange={(e) => setAdminForm({ ...adminForm, title: e.target.value })}
                placeholder="e.g. Fair Housing Laws"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={adminForm.description}
                onChange={(e) => setAdminForm({ ...adminForm, description: e.target.value })}
                placeholder="Training description..."
                className="mt-1.5"
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Category</Label>
                <Select value={adminForm.category} onValueChange={(value) => setAdminForm({ ...adminForm, category: value })}>
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fair_housing">Fair Housing</SelectItem>
                    <SelectItem value="ethics">Ethics</SelectItem>
                    <SelectItem value="compliance">Compliance</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Passing Score %</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={adminForm.passing_score}
                  onChange={(e) => setAdminForm({ ...adminForm, passing_score: parseInt(e.target.value) })}
                  className="mt-1.5"
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="ai" className="space-y-4 py-4">
            <div className="bg-muted rounded-lg p-3 text-sm text-muted-foreground mb-4">
              AI will generate 5 questions based on your topic and save them to this training.
            </div>
            <div>
              <Label>Training Title *</Label>
              <Input
                value={aiForm.title}
                onChange={(e) => setAiForm({ ...aiForm, title: e.target.value })}
                placeholder="e.g. Fair Housing Basics"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label>Topic for Questions *</Label>
              <Textarea
                value={aiForm.topic}
                onChange={(e) => setAiForm({ ...aiForm, topic: e.target.value })}
                placeholder="Describe what the quiz should cover..."
                className="mt-1.5"
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Category</Label>
                <Select value={aiForm.category} onValueChange={(value) => setAiForm({ ...aiForm, category: value })}>
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fair_housing">Fair Housing</SelectItem>
                    <SelectItem value="ethics">Ethics</SelectItem>
                    <SelectItem value="compliance">Compliance</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Passing Score %</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={aiForm.passing_score}
                  onChange={(e) => setAiForm({ ...aiForm, passing_score: parseInt(e.target.value) })}
                  className="mt-1.5"
                />
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={tab === 'admin' ? handleCreateAdmin : handleGenerateAI}
            disabled={tab === 'admin' ? !adminForm.title : !aiForm.title || !aiForm.topic || generating}
            className="rounded-xl"
          >
            {generating ? 'Generating...' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}