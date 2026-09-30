import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { lazy, Suspense, useState, useEffect } from 'react';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { MobileTabBarProvider } from '@/components/layout/MobileTabBarProvider';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import AppLayout from '@/components/layout/AppLayout';

// Lazy load all pages
const Dashboard = lazy(() => import('@/pages/Dashboard'));
const Chat = lazy(() => import('@/pages/Chat'));
const ScheduleCalls = lazy(() => import('@/pages/ScheduleCalls'));
const BrokerMonitor = lazy(() => import('@/pages/BrokerMonitor'));
const SocialChat = lazy(() => import('@/pages/SocialChat'));
const Settings = lazy(() => import('@/pages/Settings'));
const AdminChat = lazy(() => import('@/pages/AdminChat'));
const SuperAdmin = lazy(() => import('@/pages/SuperAdmin'));
const Analytics = lazy(() => import('@/pages/Analytics'));
const BrokerageUsers = lazy(() => import('@/pages/BrokerageUsers'));
const Profile = lazy(() => import('@/pages/Profile'));
const JoinBrokerage = lazy(() => import('@/pages/JoinBrokerage'));
const DirectMessages = lazy(() => import('@/pages/DirectMessages'));
const AgentLeaderboard = lazy(() => import('@/pages/AgentLeaderboard'));
const ComplianceTraining = lazy(() => import('@/pages/ComplianceTraining'));
const ComplianceQuiz = lazy(() => import('@/pages/ComplianceQuiz'));
const ESignDocuments = lazy(() => import('@/pages/ESignDocuments'));
const ESignAdmin = lazy(() => import('@/pages/ESignAdmin'));
const CustomESign = lazy(() => import('@/pages/CustomESign'));
const CustomSign = lazy(() => import('@/pages/CustomSign'));
const PublicSigner = lazy(() => import('@/pages/PublicSigner.jsx'));
const BulkSign = lazy(() => import('@/pages/BulkSign'));
const Recognition = lazy(() => import('@/pages/Recognition'));
const IdeaHub = lazy(() => import('@/pages/IdeaHub'));
const EventBoard = lazy(() => import('@/pages/EventBoard'));
const FileRepository = lazy(() => import('@/pages/FileRepository'));
const CultureCalendar = lazy(() => import('@/pages/CultureCalendar'));
const TechLinks = lazy(() => import('@/pages/TechLinks'));
const ListingGenerator = lazy(() => import('@/pages/ListingGenerator'));
const NetSheetCalculator = lazy(() => import('@/pages/NetSheetCalculator'));
const SalesCoach = lazy(() => import('@/pages/SalesCoach'));
const ContractGenerator = lazy(() => import('@/pages/ContractGenerator'));
const Onboarding = lazy(() => import('@/pages/Onboarding'));
const CMABuilder = lazy(() => import('@/pages/CMABuilder'));
const MyReports = lazy(() => import('@/pages/MyReports'));
const ClientAppreciation = lazy(() => import('@/pages/ClientAppreciation'));
const PublicReview = lazy(() => import('@/pages/PublicReview'));
const Reviews = lazy(() => import('@/pages/Reviews'));
const Transactions = lazy(() => import('@/pages/Transactions'));
const ClientPortal = lazy(() => import('@/pages/ClientPortal'));
const Login = lazy(() => import('@/pages/Login'));
const Offers = lazy(() => import('@/pages/Offers'));
const ResetPassword = lazy(() => import('@/pages/ResetPassword'));

// Loading fallback component
const PageLoader = () => (
  <div className="fixed inset-0 flex items-center justify-center">
    <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
  </div>
);

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();
  const location = useLocation();

  const isPublicRoute = ['/sign', '/custom-sign', '/BulkSign', '/review', '/login', '/reset-password'].includes(location.pathname);

  // Always render public routes immediately - no auth required
  if (isPublicRoute) {
    return (
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/sign" element={<PublicSigner />} />
          <Route path="/custom-sign" element={<CustomSign />} />
          <Route path="/BulkSign" element={<BulkSign />} />
          <Route path="/review" element={<PublicReview />} />
          <Route path="/login" element={<Login />} />
          <Route path="/reset-password" element={<ResetPassword />} />
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
            <Route path="/AdminChat" element={<AdminChat />} />
            <Route path="/SuperAdmin" element={<SuperAdmin />} />
            <Route path="/Analytics" element={<Analytics />} />
            <Route path="/BrokerageUsers" element={<BrokerageUsers />} />
            <Route path="/Profile" element={<Profile />} />
            <Route path="/DirectMessages" element={<DirectMessages />} />
            <Route path="/AgentLeaderboard" element={<AgentLeaderboard />} />
            <Route path="/ComplianceTraining" element={<ComplianceTraining />} />
            <Route path="/ComplianceQuiz" element={<ComplianceQuiz />} />
            <Route path="/ESignDocuments" element={<ESignDocuments />} />
            <Route path="/ESignAdmin" element={<ESignAdmin />} />
            <Route path="/CustomESign" element={<CustomESign />} />
            <Route path="/Recognition" element={<Recognition />} />
            <Route path="/IdeaHub" element={<IdeaHub />} />
            <Route path="/EventBoard" element={<EventBoard />} />
            <Route path="/FileRepository" element={<FileRepository />} />
            <Route path="/CultureCalendar" element={<CultureCalendar />} />
            <Route path="/TechLinks" element={<TechLinks />} />
            <Route path="/ListingGenerator" element={<ListingGenerator />} />
            <Route path="/NetSheetCalculator" element={<NetSheetCalculator />} />
            <Route path="/SalesCoach" element={<SalesCoach />} />
            <Route path="/ContractGenerator" element={<ContractGenerator />} />
            <Route path="/Offers" element={<Offers />} />
            <Route path="/Onboarding" element={<Onboarding />} />
            <Route path="/CMABuilder" element={<CMABuilder />} />
            <Route path="/MyReports" element={<MyReports />} />
            <Route path="/ClientAppreciation" element={<ClientAppreciation />} />
            <Route path="/Reviews" element={<Reviews />} />
            <Route path="/Transactions" element={<Transactions />} />
            <Route path="/ClientPortal" element={<ClientPortal />} />
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
      <Router>
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