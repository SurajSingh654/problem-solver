import { Routes, Route, Navigate } from 'react-router-dom'
import { AppShell } from '@components/layout/AppShell'
import { ProtectedRoute } from '@components/layout/ProtectedRoute'
import { ToastContainer } from '@components/ui/Toast'
import Dashboard from '@pages/Dashboard'
import Login from '@pages/auth/Login'
import Register from '@pages/auth/Register'
import ReadmePage from '@pages/docs/ReadmePage'
import SetupPage from '@pages/docs/SetupPage'
import ProblemsPage from '@pages/problems/ProblemsPage'
import ProblemDetailPage from '@pages/problems/ProblemDetailPage'
import SubmitSolutionPage from '@pages/problems/SubmitSolutionPage'
import EditSolutionPage from '@pages/problems/EditSolutionPage'
import InterviewSimPage from '@pages/InterviewSimPage'
import ReviewQueuePage from '@pages/ReviewQueuePage'
import ReportPage from '@pages/ReportPage'
import LeaderboardPage from '@pages/LeaderboardPage'
import ProfilePage from '@pages/ProfilePage'
import SettingsPage from '@pages/SettingsPage'
import AdminPage from '@pages/admin/AdminPage'
import AddProblemPage from '@pages/admin/AddProblemPage'
import EditProblemPage from '@pages/admin/EditProblemPage'

function ComingSoon({ name, step }) {
  return (
    <div className="flex flex-col items-center justify-center
                    min-h-[60vh] gap-4 text-text-secondary">
      <div className="w-14 h-14 rounded-2xl bg-brand-400/10 border border-brand-400/20
                      flex items-center justify-center text-2xl animate-float">
        ⚡
      </div>
      <div className="text-center">
        <p className="text-lg font-bold text-text-primary">{name}</p>
        <p className="text-sm mt-1 text-text-tertiary">
          Coming in Step {step}
        </p>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <>
      <Routes>
        {/* Public */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* Protected */}
        <Route element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }>
          <Route path="/" element={<Dashboard />} />
          <Route path="/problems" element={<ProblemsPage />} />
          <Route path="/problems/:id" element={<ProblemDetailPage />} />
          <Route path="/problems/:id/submit" element={<SubmitSolutionPage />} />
          <Route path="/problems/:id/edit" element={<EditSolutionPage />} />
          <Route path="/interview" element={<InterviewSimPage />} />
          <Route path="/review" element={<ReviewQueuePage />} />
          <Route path="/report" element={<ReportPage />} />
          <Route path="/leaderboard" element={<LeaderboardPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/profile/:username" element={<ProfilePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/docs/readme" element={<ReadmePage />} />
          <Route path="/docs/setup" element={<SetupPage />} />

          {/* Admin */}
          <Route path="/admin" element={
            <ProtectedRoute adminOnly><AdminPage /></ProtectedRoute>
          } />
          <Route path="/admin/problems/new" element={
            <ProtectedRoute adminOnly><AddProblemPage /></ProtectedRoute>
          } />
          <Route path="/admin/problems/:id/edit" element={
            <ProtectedRoute adminOnly><EditProblemPage /></ProtectedRoute>
          } />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {/* Toast for public pages (login/register) */}
      <ToastContainer />
    </>
  )
}