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
import DeployPage from '@pages/docs/DeployPage'
import ChangePasswordPage from '@pages/auth/ChangePasswordPage'
import QuizPage from '@pages/QuizPage'
import ShowcasePage from '@pages/admin/ShowcasePage'
import VerifyEmailPage from '@pages/auth/VerifyEmailPage'
import ForgotPasswordPage from '@pages/auth/ForgotPasswordPage'
import ResetPasswordPage from '@pages/auth/ResetPasswordPage'
import AdminDashboard from '@pages/AdminDashboard'
import { useAuthStore } from '@store/useAuthStore'
import ProductHealthPage from '@pages/admin/ProductHealthPage'
import MockInterviewPage from '@pages/MockInterviewPage'

function DashboardPage() {
  const { user } = useAuthStore()
  if (user?.role === 'ADMIN') return <AdminDashboard />
  return <Dashboard />
}


export default function App() {
  return (
    <>
      <Routes>
        {/* Public */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />

        {/* Protected */}
        <Route element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/problems" element={<ProblemsPage />} />
          <Route path="/problems/:id" element={<ProblemDetailPage />} />
          <Route path="/problems/:id/submit" element={<SubmitSolutionPage />} />
          <Route path="/problems/:id/edit" element={<EditSolutionPage />} />
          <Route path="/interview" element={<InterviewSimPage />} />
          <Route path="/mock-interview" element={<MockInterviewPage />} />
          <Route path="/review" element={<ReviewQueuePage />} />
          <Route path="/report" element={<ReportPage />} />
          <Route path="/leaderboard" element={<LeaderboardPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/profile/:username" element={<ProfilePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/docs/readme" element={<ReadmePage />} />
          <Route path="/docs/setup" element={<SetupPage />} />
          <Route path="/docs/deploy" element={<DeployPage />} />
          <Route path="/change-password" element={<ChangePasswordPage />} />
          <Route path="/quizzes" element={<QuizPage />} />

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
          <Route path="/admin/showcase" element={
            <ProtectedRoute adminOnly><ShowcasePage /></ProtectedRoute>
          } />
          <Route path="/admin/analytics" element={
            <ProtectedRoute adminOnly><ProductHealthPage /></ProtectedRoute>
          } />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {/* Toast for public pages (login/register) */}
      <ToastContainer />
    </>
  )
}