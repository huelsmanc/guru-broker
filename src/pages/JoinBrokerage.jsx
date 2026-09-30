import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Building2, CheckCircle } from 'lucide-react';

export default function JoinBrokerage() {
  const [brokerageId, setBrokerageId] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [brokerage, setBrokerage] = useState(null);
  const [completed, setCompleted] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const brokerageFromUrl = urlParams.get('brokerage_id');
    if (brokerageFromUrl) {
      setBrokerageId(brokerageFromUrl);
    }
  }, []);

  const handleJoin = async () => {
    if (!brokerageId.trim()) return;
    setLoading(true);
    setError('');
    const results = await base44.entities.Brokerage.filter({ id: brokerageId.trim() });
    if (!results.length || results[0].status !== 'active') {
      setError('Brokerage not found or inactive. Please check the ID and try again.');
      setLoading(false);
      return;
    }
    const b = results[0];
    setBrokerage(b);
    await base44.auth.updateMe({ brokerage_id: b.id, brokerage_name: b.name, role: 'user' });
    setLoading(false);
  };

  const handleSetName = async () => {
    if (!firstName.trim() || !lastName.trim()) return;
    const fullName = `${firstName.trim()} ${lastName.trim()}`;
    await base44.auth.updateMe({ full_name: fullName });
    setCompleted(true);
  };

  const handleContinue = () => {
    navigate('/Dashboard');
  };

  if (brokerage && !completed) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="bg-card rounded-2xl border border-border p-10 max-w-md w-full">
          <h2 className="text-2xl font-bold text-foreground mb-2">Complete Your Profile</h2>
          <p className="text-muted-foreground text-sm mb-6">Enter your name to finish setting up your account.</p>
          <div className="space-y-4">
            <div>
              <Label>First Name</Label>
              <Input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="e.g. Cody"
                className="mt-1.5"
                onKeyDown={(e) => e.key === 'Enter' && handleSetName()}
              />
            </div>
            <div>
              <Label>Last Name</Label>
              <Input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="e.g. Heelsman"
                className="mt-1.5"
                onKeyDown={(e) => e.key === 'Enter' && handleSetName()}
              />
            </div>
            <Button
              onClick={handleSetName}
              disabled={!firstName.trim() || !lastName.trim() || loading}
              className="w-full rounded-xl h-11 mt-6"
            >
              {loading ? 'Setting up...' : 'Continue'}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (brokerage && completed) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="bg-card rounded-2xl border border-border p-10 max-w-md w-full text-center">
          <CheckCircle className="w-14 h-14 text-accent mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-foreground mb-2">You're all set!</h2>
          <p className="text-muted-foreground mb-1">Welcome to</p>
          <p className="text-xl font-semibold text-foreground mb-6">{brokerage.name}</p>
          <Button onClick={handleContinue} className="w-full rounded-xl h-11">
            Go to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="bg-card rounded-2xl border border-border p-10 max-w-md w-full">
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
            <Building2 className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Join Your Brokerage</h1>
          <p className="text-muted-foreground text-sm mt-2 text-center">
            Enter the Brokerage ID provided by your broker to get started.
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <Label>Brokerage ID</Label>
            <Input
              value={brokerageId}
              onChange={(e) => setBrokerageId(e.target.value)}
              placeholder="Paste your brokerage ID here"
              className="mt-1.5 font-mono"
              onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button onClick={handleJoin} disabled={!brokerageId.trim() || loading} className="w-full rounded-xl h-11">
            {loading ? 'Looking up...' : 'Join Brokerage'}
          </Button>
        </div>
      </div>
    </div>
  );
}