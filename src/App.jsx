import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { Suspense, useState, useEffect } from 'react';
import { page } from '@/lib/pages';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import SecondStepGate from '@/components/auth/SecondStepGate';
import { MobileTabBarProvider } from '@/components/layout/MobileTabBarProvider';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import AppLayout from '@/components/layout/AppLayout';

// Lazy load all pages
const Dashboard = page(() => import('@/pages/Dashboard'));
const Chat = page(() => import('@/pages/Chat'));
const ScheduleCalls = page(() => import('@/pages/ScheduleCalls'));
const BrokerMonitor = page(() => import('@/pages/BrokerMonitor'));
const SocialChat = page(() => import('@/pages/SocialChat'));
const Settings = page(() => import('@/pages/Settings'));
const SuperAdmin = page(() => import('@/pages/SuperAdmin'));
const Privacy = page(() => import('@/pages/Privacy'));
const Support = page(() => import('@/pages/Support'));
const Profile = page(() => import('@/pages/Profile'));
const JoinBrokerage = page(() => import('@/pages/JoinBrokerage'));
const DirectMessages = page(() => import('@/pages/DirectMessages'));
const AgentLeaderboard = page(() => import('@/pages/AgentLeaderboard'));
const ComplianceTraining = page(() => import('@/pages/ComplianceTraining'));
const ComplianceQuiz = page(() => import('@/pages/ComplianceQuiz'));
const ESignDocuments = page(() => import('@/pages/ESignDocuments'));
const ESignAdmin = page(() => import('@/pages/ESignAdmin'));
const CustomESign = page(() => import('@/pages/CustomESign'));
const CustomSign = page(() => import('@/pages/CustomSign'));
const PublicSigner = page(() => import('@/pages/PublicSigner.jsx'));
const VerifyDocument = page(() => import('@/pages/VerifyDocument.jsx'));
const BulkSign = page(() => import('@/pages/BulkSign'));
const EventBoard = page(() => import('@/pages/EventBoard'));
const FileRepository = page(() => import('@/pages/FileRepository'));
const Culture = page(() => import('@/pages/Culture'));
const TechLinks = page(() => import('@/pages/TechLinks'));
const SalesCoach = page(() => import('@/pages/SalesCoach'));
const Onboarding = page(() => import('@/pages/Onboarding'));
const MarketingHub = page(() => import('@/pages/MarketingHub'));
const GearStore = page(() => import('@/pages/GearStore'));
const PublicReview = page(() => import('@/pages/PublicReview'));
const Transactions = page(() => import('@/pages/Transactions'));
const Contacts = page(() => import('@/pages/Contacts'));
const MyLeads = page(() => import('@/pages/MyLeads'));
const AgentPulse = page(() => import('@/pages/AgentPulse'));
const ClientPortal = page(() => import('@/pages/ClientPortal'));
const Login = page(() => import('@/pages/Login'));
const Offers = page(() => import('@/pages/Offers'));
const TransactionWorkspace = page(() => import('@/pages/TransactionWorkspace'));
const ClientStatus = page(() => import('@/pages/ClientStatus'));
const PortalPage = page(() => import('@/pages/PortalPage'));
const ResetPassword = page(() => import('@/pages/ResetPassword'));
const MyCommissions = page(() => import('@/pages/MyCommissions'));
const Payouts = page(() => import('@/pages/Payouts'));
const CommissionPlans = page(() => import('@/pages/CommissionPlans'));
const Reports = page(() => import('@/pages/Reports'));
const Activity = page(() => import('@/pages/Activity'));
const ApproveDocs = page(() => import('@/pages/ApproveDocs'));
const ChecklistTemplates = page(() => import('@/pages/ChecklistTemplates'));
const Import = page(() => import('@/pages/Import'));


// Old page addresses that moved into a tab: keep their query (e.g. ?tab=saved) and add the tab.
function KeepQuery({ to, add }) {
  const { search } = useLocation();
  const q = new URLSearchParams(search);
  for (const [k, v] of new URLSearchParams(add)) q.set(k, v);
  return <Navigate to={`${to}?${q.toString()}`} replace />;
}

// Loading fallback component
const PageLoader = () => (
  <div className="fixed inset-0 flex items-center justify-center">
    <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
  </div>
);

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin, user, checkAppState, logout } = useAuth();
  const location = useLocation();

  const isPublicRoute = ['/sign', '/verify', '/custom-sign', '/BulkSign', '/review', '/login', '/reset-password', '/status', '/portal', '/privacy', '/support'].includes(location.pathname);

  // Always render public routes immediately - no auth required
  if (isPublicRoute) {
    return (
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/sign" element={<PublicSigner />} />
          <Route path="/verify" element={<VerifyDocument />} />
          <Route path="/custom-sign" element={<CustomSign />} />
          <Route path="/BulkSign" element={<BulkSign />} />
          <Route path="/review" element={<PublicReview />} />
          <Route path="/login" element={<Login />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/status" element={<ClientStatus />} />
          <Route path="/portal" element={<PortalPage />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/support" element={<Support />} />
        </Routes>
      </Suspense>
    );
  }

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'second_step') {
      return <SecondStepGate user={user} status={authError.status} onDone={checkAppState} onSignOut={() => logout(true)} />;
    } else if (authError.type === 'auth_required') {
      navigateToLogin();
      return null;
    }
  }

  // Render the main app
  return (
    <AnimatePresence mode="wait">
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/sign" element={<PublicSigner />} />
          <Route path="/verify" element={<VerifyDocument />} />
          <Route path="/custom-sign" element={<CustomSign />} />
          <Route path="/BulkSign" element={<BulkSign />} />
          <Route path="/review" element={<PublicReview />} />
          <Route path="/" element={<Navigate to="/Dashboard" replace />} />
          <Route element={<AppLayout />}>
            <Route path="/Dashboard" element={<Dashboard />} />
            <Route path="/Chat" element={<Chat />} />
            <Route path="/ScheduleCalls" element={<ScheduleCalls />} />
            <Route path="/BrokerMonitor" element={<BrokerMonitor />} />
            <Route path="/SocialChat" element={<SocialChat />} />
            <Route path="/Settings" element={<Settings />} />
            {/* Broker Chat was retired: brokers and admins use a private channel instead. */}
            <Route path="/AdminChat" element={<Navigate to="/DirectMessages" replace />} />
            <Route path="/SuperAdmin" element={<SuperAdmin />} />
            <Route path="/Analytics" element={<Navigate to="/Reports?report=support_chats" replace />} />
            <Route path="/BrokerageUsers" element={<KeepQuery to="/Settings" add="tab=users" />} />
            <Route path="/Profile" element={<Profile />} />
            <Route path="/DirectMessages" element={<DirectMessages />} />
            <Route path="/AgentLeaderboard" element={<AgentLeaderboard />} />
            <Route path="/ComplianceTraining" element={<ComplianceTraining />} />
            <Route path="/ComplianceQuiz" element={<ComplianceQuiz />} />
            <Route path="/ESignDocuments" element={<ESignDocuments />} />
            <Route path="/ESignAdmin" element={<ESignAdmin />} />
            <Route path="/CustomESign" element={<CustomESign />} />
            <Route path="/Recognition" element={<Navigate to="/Culture?tab=recognition" replace />} />
            <Route path="/IdeaHub" element={<Navigate to="/Culture?tab=ideas" replace />} />
            <Route path="/EventBoard" element={<EventBoard />} />
            <Route path="/FileRepository" element={<FileRepository />} />
            <Route path="/CultureCalendar" element={<Navigate to="/Culture?tab=calendar" replace />} />
            <Route path="/Culture" element={<Culture />} />
            <Route path="/TechLinks" element={<TechLinks />} />
            <Route path="/ListingGenerator" element={<Navigate to="/Marketing?tool=listing" replace />} />
            <Route path="/NetSheetCalculator" element={<Navigate to="/Marketing?tool=netsheet" replace />} />
            <Route path="/SalesCoach" element={<SalesCoach />} />
            <Route path="/ContractGenerator" element={<Navigate to="/Offers?tab=forms" replace />} />
            <Route path="/Offers" element={<Offers />} />
            <Route path="/Transactions/:id" element={<TransactionWorkspace />} />
            <Route path="/Onboarding" element={<Onboarding />} />
            <Route path="/CMABuilder" element={<KeepQuery to="/Marketing" add="tool=cma" />} />
            <Route path="/MyReports" element={<Navigate to="/Marketing?tool=cma&tab=saved" replace />} />
            <Route path="/ClientAppreciation" element={<Navigate to="/Marketing?tool=clients" replace />} />
            <Route path="/Reviews" element={<Navigate to="/Marketing?tool=clients" replace />} />
            <Route path="/Transactions" element={<Transactions />} />
            <Route path="/Contacts" element={<Contacts />} />
            <Route path="/MyLeads" element={<MyLeads />} />
            <Route path="/AgentPulse" element={<AgentPulse />} />
            <Route path="/ClientPortal" element={<ClientPortal />} />
            <Route path="/MyCommissions" element={<MyCommissions />} />
            <Route path="/Marketing" element={<MarketingHub />} />
            <Route path="/GearStore" element={<GearStore />} />
            <Route path="/Payouts" element={<Payouts />} />
            <Route path="/CommissionPlans" element={<CommissionPlans />} />
            <Route path="/Reports" element={<Reports />} />
            <Route path="/Activity" element={<Activity />} />
            <Route path="/ApproveDocs" element={<ApproveDocs />} />
            <Route path="/ChecklistTemplates" element={<ChecklistTemplates />} />
            <Route path="/Import" element={<Import />} />
          </Route>
          <Route path="/JoinBrokerage" element={<JoinBrokerage />} />
          <Route path="*" element={<PageNotFound />} />
        </Routes>
      </Suspense>
    </AnimatePresence>
  );
};


function App() {
  return (
    <QueryClientProvider client={queryClientInstance}>
      <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AuthProvider>
          <MobileTabBarProvider>
            <AuthenticatedApp />
          </MobileTabBarProvider>
        </AuthProvider>
      </Router>
      <Toaster />
    </QueryClientProvider>
  )
}

export default App