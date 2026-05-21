import { BrowserRouter as Router, Routes, Route, Link, useLocation, useNavigate, Navigate } from "react-router-dom";
import PipelineGraph from "./components/PipelineGraph";
import ComplianceInbox from "./components/ComplianceInbox";
import CircularSubmitForm from "./components/CircularSubmitForm";
import DepartmentPortal from "./components/DepartmentPortal";
import AuditDashboard from "./components/AuditDashboard";
import ObligationGraph from "./components/ObligationGraph";
import LoginPage from "./components/LoginPage";
import { AuthProvider, useAuth } from "./context/authContext";
import { LayoutDashboard, Inbox, FilePlus, Building2, BarChart, GitBranch, LogOut, ShieldCheck } from "lucide-react";

const DEPT_ROLES = ["IT Dept", "Retail Banking", "Legal Dept", "Operations"];

function Sidebar() {
  const location = useLocation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const isActive = (path: string) => location.pathname === path;
  const isDeptActive = location.pathname.startsWith("/department/");
  const isCO = user?.role === "CO";

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  return (
    <aside className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col z-10 relative">
      <div className="p-6">
        <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-indigo-500 bg-clip-text text-transparent">
          RegRadar
        </h1>
        <p className="text-gray-400 text-sm mt-1">Compliance System</p>
      </div>

      {isCO && (
        <div className="px-4 mb-4">
          <Link
            to="/submit"
            className="w-full flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2.5 rounded-lg transition-colors font-medium shadow-lg shadow-blue-500/20"
          >
            <FilePlus size={18} />
            <span>Ingest Circular</span>
          </Link>
        </div>
      )}

      <nav className="flex-1 px-4 space-y-1 mt-2">
        {isCO && (
          <>
            <p className="text-[10px] uppercase tracking-widest text-gray-600 font-bold px-4 pb-1">Officer View</p>
            <Link to="/" className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${isActive("/") ? "bg-blue-500/10 text-blue-400 border border-blue-500/20" : "text-gray-400 hover:bg-gray-800 hover:text-white border border-transparent"}`}>
              <LayoutDashboard size={20} /><span className="font-medium">Pipeline View</span>
            </Link>
            <Link to="/inbox" className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${isActive("/inbox") ? "bg-blue-500/10 text-blue-400 border border-blue-500/20" : "text-gray-400 hover:bg-gray-800 hover:text-white border border-transparent"}`}>
              <Inbox size={20} /><span className="font-medium">Compliance Inbox</span>
            </Link>
            <Link to="/audit" className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${isActive("/audit") ? "bg-blue-500/10 text-blue-400 border border-blue-500/20" : "text-gray-400 hover:bg-gray-800 hover:text-white border border-transparent"}`}>
              <BarChart size={20} /><span className="font-medium">Audit Reporting</span>
            </Link>
            <Link to="/obligation-graph" className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${isActive("/obligation-graph") ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20" : "text-gray-400 hover:bg-gray-800 hover:text-white border border-transparent"}`}>
              <GitBranch size={20} /><span className="font-medium">Obligation Graph</span>
            </Link>
          </>
        )}

        {!isCO && user?.department_name && (
          <>
            <p className="text-[10px] uppercase tracking-widest text-gray-600 font-bold px-4 pb-1">Department View</p>
            <Link
              to={`/department/${encodeURIComponent(user.department_name)}`}
              className={`flex items-center space-x-3 px-4 py-2.5 rounded-lg transition-colors ${isDeptActive ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20" : "text-gray-500 hover:bg-gray-800 hover:text-white border border-transparent"}`}
            >
              <Building2 size={18} /><span className="font-medium text-sm">{user.department_name}</span>
            </Link>
          </>
        )}
      </nav>

      {/* User info + logout */}
      <div className="p-4 border-t border-gray-800">
        <div className="flex items-center space-x-3 mb-3">
          <div className="w-8 h-8 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center">
            <ShieldCheck size={16} className="text-blue-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{user?.username}</p>
            <p className="text-xs text-gray-500">{user?.role === "CO" ? "Compliance Officer" : user?.department_name}</p>
          </div>
        </div>
        <button onClick={handleLogout} className="w-full flex items-center justify-center space-x-2 text-gray-400 hover:text-white hover:bg-gray-800 px-3 py-2 rounded-lg transition-colors text-sm">
          <LogOut size={16} /><span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
}

function AppLayout() {
  const { user } = useAuth();

  return (
    <div className="flex h-screen bg-gray-950 text-white font-sans overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col relative">
        <main className="flex-1 relative overflow-hidden">
          <Routes>
            {/* CO-only routes */}
            {user?.role === "CO" ? (
              <>
                <Route path="/" element={<PipelineGraph />} />
                <Route path="/inbox" element={<ComplianceInbox />} />
                <Route path="/audit" element={<AuditDashboard />} />
                <Route path="/submit" element={<CircularSubmitForm />} />
                <Route path="/obligation-graph" element={<ObligationGraph />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </>
            ) : (
              <>
                <Route
                  path="/department/:dept"
                  element={<DepartmentPortalWrapper />}
                />
                <Route
                  path="*"
                  element={<Navigate to={`/department/${encodeURIComponent(user?.department_name || "")}`} replace />}
                />
              </>
            )}
          </Routes>
        </main>
      </div>
    </div>
  );
}

function AuthGate() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
      </div>
    );
  }

  return user ? <AppLayout /> : <LoginPage />;
}

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <AuthGate />
      </Router>
    </AuthProvider>
  );
}

function DepartmentPortalWrapper() {
  const location = useLocation();
  const dept = decodeURIComponent(location.pathname.replace("/department/", ""));
  return <DepartmentPortal department={dept} />;
}
