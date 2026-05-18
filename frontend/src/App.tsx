import { BrowserRouter as Router, Routes, Route, Link } from "react-router-dom";
import PipelineGraph from "./components/PipelineGraph";
import { LayoutDashboard, Inbox } from "lucide-react";

export default function App() {
  return (
    <Router>
      <div className="flex h-screen bg-gray-950 text-white font-sans overflow-hidden">
        {/* Sidebar */}
        <aside className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col z-10 relative">
          <div className="p-6">
            <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-indigo-500 bg-clip-text text-transparent">
              RegRadar
            </h1>
            <p className="text-gray-400 text-sm mt-1">Compliance System</p>
          </div>
          <nav className="flex-1 px-4 space-y-2 mt-4">
            <Link
              to="/"
              className="flex items-center space-x-3 px-4 py-3 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 transition-colors"
            >
              <LayoutDashboard size={20} />
              <span className="font-medium">Pipeline View</span>
            </Link>
            <Link
              to="/inbox"
              className="flex items-center space-x-3 px-4 py-3 rounded-lg text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
            >
              <Inbox size={20} />
              <span className="font-medium">Compliance Inbox</span>
            </Link>
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 relative h-full">
          <Routes>
            <Route path="/" element={<PipelineGraph />} />
            <Route
              path="/inbox"
              element={
                <div className="p-8 flex items-center justify-center h-full">
                  <div className="text-center">
                    <Inbox size={48} className="mx-auto text-gray-700 mb-4" />
                    <h2 className="text-2xl text-gray-500 font-semibold">Compliance Inbox</h2>
                    <p className="text-gray-600 mt-2">Coming soon...</p>
                  </div>
                </div>
              }
            />
          </Routes>
        </main>
      </div>
    </Router>
  );
}
