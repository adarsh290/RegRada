import { BrowserRouter as Router, Routes, Route, Link, useLocation, useNavigate } from "react-router-dom";
import PipelineGraph from "./components/PipelineGraph";
import ComplianceInbox from "./components/ComplianceInbox";
import CircularSubmitForm from "./components/CircularSubmitForm";
import DepartmentPortal from "./components/DepartmentPortal";
import AuditDashboard from "./components/AuditDashboard";
import { LayoutDashboard, Inbox, FilePlus, User, Building2, BarChart } from "lucide-react";
import { useState } from "react";

const DEPT_ROLES = ["IT Dept", "Retail Banking", "Legal Dept", "Operations"];

function Sidebar() {
  const location = useLocation();
  const isActive = (path: string) => location.pathname === path;
  const isDeptActive = location.pathname.startsWith("/department/");

  return (
    <aside className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col z-10 relative">
      <div className="p-6">
        <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-indigo-500 bg-clip-text text-transparent">
          RegRadar
        </h1>
        <p className="text-gray-400 text-sm mt-1">Compliance System</p>
      </div>

      <div className="px-4 mb-4">
        <Link
          to="/submit"
          className="w-full flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2.5 rounded-lg transition-colors font-medium shadow-lg shadow-blue-500/20"
        >
          <FilePlus size={18} />
          <span>Ingest Circular</span>
        </Link>
      </div>

      <nav className="flex-1 px-4 space-y-1 mt-2">
        <p className="text-[10px] uppercase tracking-widest text-gray-600 font-bold px-4 pb-1">Officer View</p>
        <Link
          to="/"
          className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
            isActive("/")
              ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
              : "text-gray-400 hover:bg-gray-800 hover:text-white border border-transparent"
          }`}
        >
          <LayoutDashboard size={20} />
          <span className="font-medium">Pipeline View</span>
        </Link>
        <Link
          to="/inbox"
          className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
            isActive("/inbox")
              ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
              : "text-gray-400 hover:bg-gray-800 hover:text-white border border-transparent"
          }`}
        >
          <Inbox size={20} />
          <span className="font-medium">Compliance Inbox</span>
        </Link>
        <Link
          to="/audit"
          className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
            isActive("/audit")
              ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
              : "text-gray-400 hover:bg-gray-800 hover:text-white border border-transparent"
          }`}
        >
          <BarChart size={20} />
          <span className="font-medium">Audit Reporting</span>
        </Link>

        <p className="text-[10px] uppercase tracking-widest text-gray-600 font-bold px-4 pb-1 pt-4">Department View</p>
        {DEPT_ROLES.map((dept) => {
          const slug = encodeURIComponent(dept);
          const href = `/department/${slug}`;
          return (
            <Link
              key={dept}
              to={href}
              className={`flex items-center space-x-3 px-4 py-2.5 rounded-lg transition-colors ${
                isDeptActive && location.pathname === href
                  ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20"
                  : "text-gray-500 hover:bg-gray-800 hover:text-white border border-transparent"
              }`}
            >
              <Building2 size={18} />
              <span className="font-medium text-sm">{dept}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

function Header() {
  const navigate = useNavigate();
  const [role, setRole] = useState("Compliance Officer");
  const allRoles = ["Compliance Officer", ...DEPT_ROLES];

  const handleRoleChange = (newRole: string) => {
    setRole(newRole);
    if (newRole === "Compliance Officer") {
      navigate("/inbox");
    } else {
      navigate(`/department/${encodeURIComponent(newRole)}`);
    }
  };

  return (
    <header className="h-16 border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm flex items-center justify-between px-8 absolute top-0 right-0 left-0 z-20">
      <div className="flex-1"></div>

      <div className="flex items-center space-x-3">
        <div className="flex items-center space-x-2 text-gray-400 text-sm">
          <User size={16} />
          <span>Viewing as:</span>
        </div>
        <select
          value={role}
          onChange={(e) => handleRoleChange(e.target.value)}
          className="bg-gray-800 border border-gray-700 text-white text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2 outline-none cursor-pointer hover:bg-gray-700 transition-colors"
        >
          {allRoles.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>
    </header>
  );
}

export default function App() {
  return (
    <Router>
      <div className="flex h-screen bg-gray-950 text-white font-sans overflow-hidden">
        <Sidebar />

        <div className="flex-1 flex flex-col relative">
          <Header />
          <main className="flex-1 relative pt-16 overflow-hidden">
            <Routes>
              <Route path="/" element={<PipelineGraph />} />
              <Route path="/inbox" element={<ComplianceInbox />} />
              <Route path="/audit" element={<AuditDashboard />} />
              <Route path="/submit" element={<CircularSubmitForm />} />
              <Route
                path="/department/:dept"
                element={<DepartmentPortalWrapper />}
              />
            </Routes>
          </main>
        </div>
      </div>
    </Router>
  );
}

function DepartmentPortalWrapper() {
  const location = useLocation();
  const dept = decodeURIComponent(location.pathname.replace("/department/", ""));
  return <DepartmentPortal department={dept} />;
}

