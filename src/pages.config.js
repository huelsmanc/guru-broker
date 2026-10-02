/**
 * pages.config.js - Page routing configuration
 * 
 * This file is AUTO-GENERATED. Do not add imports or modify PAGES manually.
 * Pages are auto-registered when you create files in the ./pages/ folder.
 * 
 * THE ONLY EDITABLE VALUE: mainPage
 * This controls which page is the landing page (shown when users visit the app).
 * 
 * Example file structure:
 * 
 *   import HomePage from './pages/HomePage';
 *   import Dashboard from './pages/Dashboard';
 *   import Settings from './pages/Settings';
 *   
 *   export const PAGES = {
 *       "HomePage": HomePage,
 *       "Dashboard": Dashboard,
 *       "Settings": Settings,
 *   }
 *   
 *   export const pagesConfig = {
 *       mainPage: "HomePage",
 *       Pages: PAGES,
 *   };
 * 
 * Example with Layout (wraps all pages):
 *
 *   import Home from './pages/Home';
 *   import Settings from './pages/Settings';
 *   import __Layout from './Layout.jsx';
 *
 *   export const PAGES = {
 *       "Home": Home,
 *       "Settings": Settings,
 *   }
 *
 *   export const pagesConfig = {
 *       mainPage: "Home",
 *       Pages: PAGES,
 *       Layout: __Layout,
 *   };
 *
 * To change the main page from HomePage to Dashboard, use find_replace:
 *   Old: mainPage: "HomePage",
 *   New: mainPage: "Dashboard",
 *
 * The mainPage value must match a key in the PAGES object exactly.
 */
import AgentLeaderboard from './pages/AgentLeaderboard';
import Analytics from './pages/Analytics';
import BrokerMonitor from './pages/BrokerMonitor';
import BrokerageUsers from './pages/BrokerageUsers';
import BulkSign from './pages/BulkSign';
import CMABuilder from './pages/CMABuilder';
import Chat from './pages/Chat';
import ClientAppreciation from './pages/ClientAppreciation';
import ClientPortal from './pages/ClientPortal';
import ComplianceQuiz from './pages/ComplianceQuiz';
import ComplianceTraining from './pages/ComplianceTraining';
import ContractGenerator from './pages/ContractGenerator';
import CultureCalendar from './pages/CultureCalendar';
import Dashboard from './pages/Dashboard';
import DirectMessages from './pages/DirectMessages';
import ESignAdmin from './pages/ESignAdmin';
import ESignDocuments from './pages/ESignDocuments';
import EventBoard from './pages/EventBoard';
import FileRepository from './pages/FileRepository';
import IdeaHub from './pages/IdeaHub';
import JoinBrokerage from './pages/JoinBrokerage';
import ListingGenerator from './pages/ListingGenerator';
import MyReports from './pages/MyReports';
import NetSheetCalculator from './pages/NetSheetCalculator';
import Onboarding from './pages/Onboarding';
import Profile from './pages/Profile';
import PublicReview from './pages/PublicReview';
import PublicSigner from './pages/PublicSigner';
import Recognition from './pages/Recognition';
import Reviews from './pages/Reviews';
import SalesCoach from './pages/SalesCoach';
import ScheduleCalls from './pages/ScheduleCalls';
import Settings from './pages/Settings';
import SocialChat from './pages/SocialChat';
import SuperAdmin from './pages/SuperAdmin';
import TechLinks from './pages/TechLinks';
import Transactions from './pages/Transactions';
import CustomESign from './pages/CustomESign';
import CustomSign from './pages/CustomSign';


export const PAGES = {
    "AgentLeaderboard": AgentLeaderboard,
    "Analytics": Analytics,
    "BrokerMonitor": BrokerMonitor,
    "BrokerageUsers": BrokerageUsers,
    "BulkSign": BulkSign,
    "CMABuilder": CMABuilder,
    "Chat": Chat,
    "ClientAppreciation": ClientAppreciation,
    "ClientPortal": ClientPortal,
    "ComplianceQuiz": ComplianceQuiz,
    "ComplianceTraining": ComplianceTraining,
    "ContractGenerator": ContractGenerator,
    "CultureCalendar": CultureCalendar,
    "Dashboard": Dashboard,
    "DirectMessages": DirectMessages,
    "ESignAdmin": ESignAdmin,
    "ESignDocuments": ESignDocuments,
    "EventBoard": EventBoard,
    "FileRepository": FileRepository,
    "IdeaHub": IdeaHub,
    "JoinBrokerage": JoinBrokerage,
    "ListingGenerator": ListingGenerator,
    "MyReports": MyReports,
    "NetSheetCalculator": NetSheetCalculator,
    "Onboarding": Onboarding,
    "Profile": Profile,
    "PublicReview": PublicReview,
    "PublicSigner": PublicSigner,
    "Recognition": Recognition,
    "Reviews": Reviews,
    "SalesCoach": SalesCoach,
    "ScheduleCalls": ScheduleCalls,
    "Settings": Settings,
    "SocialChat": SocialChat,
    "SuperAdmin": SuperAdmin,
    "TechLinks": TechLinks,
    "Transactions": Transactions,
    "CustomESign": CustomESign,
    "CustomSign": CustomSign,
}

export const pagesConfig = {
    mainPage: "PublicSigner",
    Pages: PAGES,
};