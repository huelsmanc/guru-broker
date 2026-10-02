// Old address for onboarding (links in older emails). Onboarding checklists now live on My Profile
// for the agent, and in Approve Docs for reviewers.
import React from 'react';
import { Navigate, useOutletContext, useSearchParams } from 'react-router-dom';

export default function Onboarding() {
  const { user } = useOutletContext();
  const [params] = useSearchParams();
  const who = String(params.get('user') || '').toLowerCase();
  const someoneElse = who && who !== String(user?.email || '').toLowerCase();
  return <Navigate to={someoneElse ? '/ApproveDocs' : '/Profile#onboarding'} replace />;
}
