// ============================================================================
// ProbSolver v3.0 — App Router
// ============================================================================
//
// ROUTING ARCHITECTURE:
//
// 1. Public routes: Auth pages — no protection, accessible to anyone.
//
// 2. Auth-only routes: Onboarding and password change — require login
//    but NOT team context (user hasn't chosen a team yet).
//
// 3. Main app routes: Require authentication + completed onboarding +
//    active team context. Wrapped in AppShell (sidebar + topbar).
//
// 4. Super Admin routes: Require SUPER_ADMIN globalRole. Separate
//    layout section so SUPER_ADMIN can access platform tools without
//    a team context.
//
// 5. Lazy loading: Heavy pages (MockInterview, Excalidraw, Showcase)
//    are lazy-loaded to keep the initial bundle small. Suspense
//    provides a loading fallback while chunks download.
//
// ============================================================================

import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// ── Layout ───────────────────────────────────────────────────
import { AppShell } from '@components/layout/AppShell'
import ProtectedRoute from '@components/layout/ProtectedRoute'
import { Spinner } from '@components/ui/Spinner'
import { ToastContainer } from '@components/ui/Toast'
import useAuthStore from '@store/useAuthStore'

// ── Auth pages (always eager — small bundle) ─────────────────
import Login from '@pages/auth/Login'
import Register from '@pages/auth/Register'
import VerifyEmailPage from '@pages/auth/VerifyEmailPage'
import ForgotPasswordPage from '@pages/auth/ForgotPasswordPage'
import ResetPasswordPage from '@pages/auth/ResetPasswordPage'
import ChangePasswordPage from '@pages/auth/ChangePasswordPage'

// ── Onboarding (eager — first thing new users see) ───────────
import OnboardingPage from '@pages/OnboardingPage'

// ── Core pages (eager — frequently accessed) ─────────────────
import Dashboard from '@pages/Dashboard'
import LeaderboardPage from '@pages/LeaderboardPage'
import ReportPage from '@pages/ReportPage'
import ReviewQueuePage from '@pages/ReviewQueuePage'
import QuizPage from '@pages/QuizPage'
import ProfilePage from '@pages/ProfilePage'
import SettingsPage from '@pages/SettingsPage'
import InterviewHistoryPage from '@pages/InterviewHistoryPage'

// ── Team pages (eager — critical for onboarding flow) ────────
import TeamManagePage from '@pages/team/TeamManagePage'
import TeamPendingPage from '@pages/team/TeamPendingPage'

// ── Super Admin (eager — only loaded for SUPER_ADMIN) ────────
import SuperAdminDashboard from '@pages/superadmin/SuperAdminDashboard'

// ── Heavy pages (lazy — loaded on demand) ────────────────────
const MockInterviewPage = lazy(() => import('@pages/MockInterviewPage'))
const InterviewSimPage = lazy(() => import('@pages/InterviewSimPage'))

// ── Admin pages (lazy — only TEAM_ADMIN accesses these) ──────
const AdminPage = lazy(() => import('@pages/admin/AdminPage'))
const AddProblemPage = lazy(() => import('@pages/admin/AddProblemPage'))
const EditProblemPage = lazy(() => import('@pages/admin/EditProblemPage'))
const ProductHealthPage = lazy(() => import('@pages/admin/ProductHealthPage'))
const ShowcasePage = lazy(() => import('@pages/admin/showcase/ShowcasePage'))

// ── Docs (lazy — rarely accessed) ────────────────────────────
const ReadmePage = lazy(() => import('@pages/docs/ReadmePage'))
const SetupPage = lazy(() => import('@pages/docs/SetupPage'))
const DeployPage = lazy(() => import('@pages/docs/DeployPage'))
const ProblemsPage = lazy(() => import('@pages/problems/ProblemsPage'))
const ProblemDetailPage = lazy(() => import('@pages/problems/ProblemDetailPage'))
const SubmitSolutionPage = lazy(() => import('@pages/problems/SubmitSolutionPage'))
const EditSolutionPage = lazy(() => import('@pages/problems/EditSolutionPage'))
const AllTeamsPage = lazy(() => import('@pages/superadmin/AllTeamsPage'))
const AllUsersPage = lazy(() => import('@pages/superadmin/AllUsersPage'))
const SuperAdminAnalyticsPage = lazy(() => import('@pages/superadmin/SuperAdminAnalyticsPage'))


// ============================================================================
// QUERY CLIENT
// ============================================================================

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2,       // 2 minutes
      gcTime: 1000 * 60 * 10,         // 10 minutes (garbage collection)
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

// ============================================================================
// SUSPENSE FALLBACK
// ============================================================================

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-[60vh]">
      <div className="flex flex-col items-center gap-3">
        <Spinner size="lg" />
        <p className="text-xs text-text-tertiary">Loading...</p>
      </div>
    </div>
  )
}

// Wraps lazy-loaded routes in Suspense
function Lazy({ children }) {
  return <Suspense fallback={<PageLoader />}>{children}</Suspense>
}

// ── Catch-all: redirect based on role ────────────────────────
function CatchAllRedirect() {
  const { user, isAuthenticated } = useAuthStore()
  if (!isAuthenticated) return <Navigate to="/auth/login" replace />
  if (user?.globalRole === 'SUPER_ADMIN') return <Navigate to="/super-admin" replace />
  return <Navigate to="/" replace />
}

// ============================================================================
// APP
// ============================================================================

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>

          {/* ============================================================ */}
          {/* PUBLIC ROUTES — No authentication required                   */}
          {/* ============================================================ */}
          <Route path="/auth/login" element={<Login />} />
          <Route path="/auth/register" element={<Register />} />
          <Route path="/auth/verify-email" element={<VerifyEmailPage />} />
          <Route path="/auth/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/auth/reset-password" element={<ResetPasswordPage />} />

          {/* ============================================================ */}
          {/* AUTH-ONLY ROUTES — Logged in but no team context required    */}
          {/* These are for users who haven't completed onboarding yet,   */}
          {/* or need to change their password before accessing the app.  */}
          {/* ============================================================ */}
          <Route
            path="/auth/change-password"
            element={
              <ProtectedRoute>
                <ChangePasswordPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="/onboarding"
            element={
              <ProtectedRoute>
                <OnboardingPage />
              </ProtectedRoute>
            }
          />

          {/* ============================================================ */}
          {/* SUPER ADMIN ROUTES — Platform-level management              */}
          {/* Wrapped in AppShell for consistent layout.                  */}
          {/* SUPER_ADMIN may not have a team context — that's OK.        */}
          {/* These routes only check globalRole, not team.               */}
          {/* ============================================================ */}
          <Route
            element={
              <ProtectedRoute requireSuperAdmin>
                <AppShell />
              </ProtectedRoute>
            }
          >
            <Route path="/super-admin" element={<SuperAdminDashboard />} />
            <Route path="/super-admin/teams" element={<Lazy><AllTeamsPage /></Lazy>} />
            <Route path="/super-admin/users" element={<Lazy><AllUsersPage /></Lazy>} />
            <Route path="/super-admin/analytics" element={<Lazy><SuperAdminAnalyticsPage /></Lazy>} />
            {/* SuperAdmin also needs profile + settings within their layout */}
            <Route path="/super-admin/profile/:userId" element={<ProfilePage />} />
            <Route path="/super-admin/profile" element={<ProfilePage />} />
            <Route path="/super-admin/settings" element={<SettingsPage />} />
            <Route path="/super-admin/showcase" element={<Lazy><ShowcasePage /></Lazy>} />
          </Route>

          {/* ============================================================ */}
          {/* MAIN APP ROUTES — Require auth + onboarding + team context  */}
          {/* Every page inside here can rely on req.teamId being set.    */}
          {/* The AppShell provides sidebar (with team switcher) + topbar */}
          {/* ============================================================ */}
          <Route
            element={
              <ProtectedRoute requireTeamContext>
                <AppShell />
              </ProtectedRoute>
            }
          >
            {/* ── Dashboard ─────────────────────────────────────────── */}
            <Route index element={<Dashboard />} />

            {/* ── Problems ──────────────────────────────────────────── */}
            {/* TODO: Replace with dedicated ProblemListPage / ProblemDetailPage */}
            <Route path="problems" element={<Lazy><ProblemsPage /></Lazy>} />
            <Route path="problems/:problemId" element={<Lazy><ProblemDetailPage /></Lazy>} />
            <Route path="problems/:problemId/submit" element={<Lazy><SubmitSolutionPage /></Lazy>} />
            <Route path="problems/:problemId/edit-solution/:solutionId" element={<Lazy><EditSolutionPage /></Lazy>} />

            {/* ── Solutions & Review ────────────────────────────────── */}
            <Route path="review" element={<ReviewQueuePage />} />

            {/* ── Quizzes ───────────────────────────────────────────── */}
            <Route path="quizzes" element={<QuizPage />} />

            {/* ── Mock Interview (lazy — heavy: Excalidraw + WS) ────── */}
            <Route
              path="mock-interview"
              element={<Lazy><MockInterviewPage /></Lazy>}
            />

            {/* ── Interview Simulation (lazy) ───────────────────────── */}
            <Route
              path="interview-sim"
              element={<Lazy><InterviewSimPage /></Lazy>}
            />

            {/* ── Interview History ─────────────────────────────────── */}
            <Route path="interview-history" element={<InterviewHistoryPage />} />

            {/* ── Leaderboard (team-only — LeaderboardPage handles    */}
            {/*    the redirect for individual-mode users internally)  */}
            <Route path="leaderboard" element={<LeaderboardPage />} />

            {/* ── Intelligence Report ───────────────────────────────── */}
            <Route path="report" element={<ReportPage />} />

            {/* ── Profile ───────────────────────────────────────────── */}
            <Route path="profile" element={<ProfilePage />} />
            <Route path="profile/:userId" element={<ProfilePage />} />

            {/* ── Settings ──────────────────────────────────────────── */}
            <Route path="settings" element={<SettingsPage />} />

            {/* ── Team Management ───────────────────────────────────── */}
            <Route path="team" element={<TeamManagePage />} />
            <Route path="team/pending" element={<TeamPendingPage />} />

            {/* ── Team Admin Routes (TEAM_ADMIN or SUPER_ADMIN) ────── */}
            <Route
              path="admin"
              element={
                <ProtectedRoute requireTeamAdmin>
                  <Lazy><AdminPage /></Lazy>
                </ProtectedRoute>
              }
            />
            <Route
              path="admin/add-problem"
              element={
                <ProtectedRoute requireTeamAdmin>
                  <Lazy><AddProblemPage /></Lazy>
                </ProtectedRoute>
              }
            />
            <Route
              path="admin/edit-problem/:problemId"
              element={
                <ProtectedRoute requireTeamAdmin>
                  <Lazy><EditProblemPage /></Lazy>
                </ProtectedRoute>
              }
            />
            <Route
              path="admin/analytics"
              element={
                <ProtectedRoute requireTeamAdmin>
                  <Lazy><ProductHealthPage /></Lazy>
                </ProtectedRoute>
              }
            />
            <Route
              path="admin/showcase"
              element={
                <ProtectedRoute requireTeamAdmin>
                  <Lazy><ShowcasePage /></Lazy>
                </ProtectedRoute>
              }
            />

            {/* ── Documentation (lazy) ──────────────────────────────── */}
            <Route path="docs/readme" element={<Lazy><ReadmePage /></Lazy>} />
            <Route path="docs/setup" element={<Lazy><SetupPage /></Lazy>} />
            <Route path="docs/deploy" element={<Lazy><DeployPage /></Lazy>} />
          </Route>

          {/* ============================================================ */}
          {/* CATCH-ALL — Redirect unknown routes to home                 */}
          {/* ============================================================ */}
          <Route path="*" element={<CatchAllRedirect />} />

        </Routes>
      </BrowserRouter>
      <ToastContainer />
    </QueryClientProvider>
  )
}