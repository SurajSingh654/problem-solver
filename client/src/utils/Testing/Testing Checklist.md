INPUT
title
ProbSolver v3.0 — End-to-End Test Checklist
content
# ProbSolver v3.0 — End-to-End Test Checklist

> **Instructions:** Test in order. Keep browser DevTools Console open throughout.
> Mark each item: ✅ Pass | ❌ Fail (describe error) | ⚠️ Visual issue
> After completing all phases, report results.

---

## Pre-Test Setup

- [ ] Clear browser localStorage (DevTools → Application → Local Storage → Clear)
- [ ] Open DevTools Console tab (filter to Errors only)
- [ ] Have SuperAdmin credentials ready (seeded account)
- [ ] Have Team Admin credentials ready (registered account with approved team)

---

## Phase 1: SuperAdmin Flow

### 1.1 — Login & Dashboard
| # | Test | Result |
|---|---|---|
| 1 | Login as SuperAdmin → lands on `/super-admin` (NOT `/`) | |
| 2 | Console: zero 400/500 errors | |
| 3 | Stats cards show numbers (Total Users, Active Teams, etc.) | |
| 4 | Pending teams section renders (shows teams or "No pending requests") | |
| 5 | Quick links clickable: All Teams, All Users, Analytics, API Docs | |

### 1.2 — All Users
| # | Test | Result |
|---|---|---|
| 6 | Navigate to All Users via sidebar | |
| 7 | Table shows users with: name, email, role badge, solved count, status, joined date | |
| 8 | Click user row → navigates to `/super-admin/profile/:userId` | |
| 9 | Profile shows: name, role badge, email, stats, recent solutions | |
| 10 | "Back to Users" button → returns to All Users | |

### 1.3 — All Teams
| # | Test | Result |
|---|---|---|
| 11 | Navigate to All Teams via sidebar | |
| 12 | Teams list shows with status badges (Active/Pending/Rejected) | |
| 13 | Click team name → expands with member list and join code | |
| 14 | Filter tabs work: All, Active, Pending, Rejected | |
| 15 | (If pending team exists) Approve → team moves to Active tab | |

### 1.4 — Platform Analytics
| # | Test | Result |
|---|---|---|
| 16 | Navigate to Platform Analytics via sidebar | |
| 17 | Overview stats cards load (Total Users, Active, Teams, etc.) | |
| 18 | User Funnel section renders with bars and percentages | |
| 19 | Weekly Trends charts render (solutions + registrations per week) | |
| 20 | Engagement + Team Health sections render | |
| 21 | Feature Adoption bars render with percentages | |
| 22 | AI Usage & Cost section shows call counts and estimated cost | |
| 23 | Content Volume section shows totals | |
| 24 | Click "AI Analysis" → wait → analysis appears with health score | |
| 25 | Navigate away → come back → analysis still visible (persisted) | |
| 26 | Period selector (7d / 30d / 90d) changes metrics | |

### 1.5 — SuperAdmin Settings
| # | Test | Result |
|---|---|---|
| 27 | Click avatar (top-right) → "Settings" → navigates to `/super-admin/settings` | |
| 28 | Profile section shows name, email, avatar color picker | |
| 29 | NO "Team" section shown (SuperAdmin doesn't have team info here) | |
| 30 | Change display name → Save → toast "Profile updated" | |
| 31 | Email Verified shows "Yes" | |
| 32 | Account section shows "Super Administrator" role | |

### 1.6 — SuperAdmin Profile
| # | Test | Result |
|---|---|---|
| 33 | Click avatar (top-right) → "My Profile" → navigates to `/super-admin/profile` | |
| 34 | Shows SuperAdmin name with "🛡️ Super Admin" badge | |
| 35 | Shows email address | |
| 36 | Stats section shows zeros (SuperAdmin has no solutions) | |
| 37 | "No solutions yet" empty state renders cleanly | |

### 1.7 — Command Palette (SuperAdmin)
| # | Test | Result |
|---|---|---|
| 38 | Press ⌘K (or Ctrl+K) → palette opens | |
| 39 | Shows "Platform" group: Dashboard, All Teams, All Users, Analytics, Settings | |
| 40 | Does NOT show: Problems, Review Queue, Quizzes, Mock Interview | |
| 41 | Type "users" → filters to "All Users" → press Enter → navigates | |
| 42 | Press ESC → palette closes | |

### 1.8 — Topbar (SuperAdmin)
| # | Test | Result |
|---|---|---|
| 43 | Page title updates on each navigation (Platform Dashboard, All Users, etc.) | |
| 44 | Crumb shows "Platform" for SuperAdmin pages | |
| 45 | Theme toggle (sun/moon) works | |
| 46 | Docs link works | |

### 1.9 — Edge Cases (SuperAdmin)
| # | Test | Result |
|---|---|---|
| 47 | Manually navigate to `/problems` → redirected to `/super-admin` | |
| 48 | Manually navigate to `/leaderboard` → redirected to `/super-admin` | |
| 49 | Manually navigate to `/review` → redirected to `/super-admin` | |
| 50 | Refresh any SuperAdmin page → stays on that page, no errors | |

---

## Phase 2: Team Admin Flow

### 2.0 — Login
| # | Test | Result |
|---|---|---|
| 51 | Logout SuperAdmin | |
| 52 | Login as Team Admin → lands on `/` (Dashboard) | |
| 53 | Console: zero errors | |

### 2.1 — Dashboard
| # | Test | Result |
|---|---|---|
| 54 | Shows team name in header (e.g., "Google SQAD Dashboard") | |
| 55 | Stats cards: Problems Solved, Streak, Reviews Due, Avg Confidence | |
| 56 | Quick actions: Problems, Mock Interview, Take Quiz, Report | |
| 57 | If pending team banner existed → no longer shows (team is approved) | |

### 2.2 — Problems (empty → create → view)
| # | Test | Result |
|---|---|---|
| 58 | Navigate to Problems → shows empty state "No problems yet" | |
| 59 | "Add Problem" button visible (you're admin) | |
| 60 | Click "Add Problem" → navigates to add form | |
| 61 | Fill: Title "Two Sum", Category "Coding", Difficulty "Easy", Tag "array" | |
| 62 | Click "Create Problem" → redirects to Admin page | |
| 63 | Go to Problems → "Two Sum" card appears | |
| 64 | Category filter shows "Coding" with count badge | |
| 65 | Difficulty filter shows "Easy" with count badge | |
| 66 | Grid/List view toggle works | |
| 67 | Search "two" → filters to show "Two Sum" | |
| 68 | Search "xyz" → shows "No problems match" empty state | |
| 69 | Clear filters works | |

### 2.3 — Problem Detail
| # | Test | Result |
|---|---|---|
| 70 | Click "Two Sum" card → navigates to detail page | |
| 71 | Title, difficulty badge, category badge display correctly | |
| 72 | "Submit Solution" button visible | |
| 73 | "Edit Problem" button visible (admin) | |
| 74 | Team Solutions shows "No solutions yet" | |
| 75 | Follow-up questions section (if any) renders | |
| 76 | Back to Problems button works | |

### 2.4 — Submit Solution
| # | Test | Result |
|---|---|---|
| 77 | Click "Submit Solution" on problem detail | |
| 78 | Step indicator shows 3 steps | |
| 79 | Step 1: Pattern selector → select "Array / Hashing" | |
| 80 | Click Next → moves to Step 2 | |
| 81 | Step 2: Write approach text, add code in Monaco editor | |
| 82 | Click Next → moves to Step 3 | |
| 83 | Step 3: Add key insight, set confidence to 4 (Pretty solid) | |
| 84 | Click "Save Solution" → redirects to problem detail | |
| 85 | Your solution now appears under "Team Solutions" | |
| 86 | Solution shows: approach, code, pattern, confidence emoji | |

### 2.5 — AI Review (if AI enabled)
| # | Test | Result |
|---|---|---|
| 87 | On problem detail, AI Review card appears for your solution | |
| 88 | Click "Get AI Review" → loading → review appears | |
| 89 | Review shows: score, strengths, gaps, improvement tip | |

### 2.6 — Review Queue
| # | Test | Result |
|---|---|---|
| 90 | Navigate to Review Queue | |
| 91 | Shows "All caught up" (review dates are in future) | |
| 92 | Stat cards: Due Today (0), Done Today (0), Upcoming, Total Tracked (1) | |
| 93 | If "How it works" section shows for new users → renders 3 steps | |

### 2.7 — Quiz
| # | Test | Result |
|---|---|---|
| 94 | Navigate to Quizzes | |
| 95 | Subject input + suggested subjects render | |
| 96 | Type "JavaScript", select Medium, 5 questions | |
| 97 | Click "Generate Quiz" → loading → quiz starts | |
| 98 | Question shows with 4 options (A, B, C, D) | |
| 99 | Select an answer → option highlights | |
| 100 | Navigation dots work (click to jump to question) | |
| 101 | Next/Previous buttons work | |
| 102 | Scratchpad opens/closes | |
| 103 | Click "Submit Quiz" → results screen | |
| 104 | Score, accuracy, time display correctly | |
| 105 | Question review: correct (green) / incorrect (red) markers | |
| 106 | Explanations show for each question | |
| 107 | Click "AI Analysis" → analysis loads with weak areas + advice | |
| 108 | Click "Take Another Quiz" → returns to setup | |
| 109 | "Past Quizzes" section shows your completed quiz | |
| 110 | "Recently Practiced" shows "JavaScript" with score | |

### 2.8 — Leaderboard
| # | Test | Result |
|---|---|---|
| 111 | Navigate to Leaderboard | |
| 112 | Shows you with rank #1 (only member with solutions) | |
| 113 | Podium renders (even with just 1 person) | |
| 114 | Table shows: Rank, Member, Solved, Hard, Streak, Confidence | |
| 115 | Click your row → navigates to `/profile/:userId` | |
| 116 | Profile shows your stats and "Two Sum" in recent solutions | |
| 117 | Back button returns to leaderboard | |

### 2.9 — Intelligence Report
| # | Test | Result |
|---|---|---|
| 118 | Navigate to Intelligence Report | |
| 119 | Radar chart or dimension scores render | |
| 120 | 6 dimensions listed with scores (may be low with 1 solution) | |
| 121 | Overall readiness score shows | |

### 2.10 — Interview History
| # | Test | Result |
|---|---|---|
| 122 | Navigate to Interview History | |
| 123 | Shows "No interviews yet" with "Start Interview" button | |

### 2.11 — Mock Interview (optional — uses AI credits)
| # | Test | Result |
|---|---|---|
| 124 | Navigate to Mock Interview | |
| 125 | Select: category, difficulty, interview style | |
| 126 | Click Start → WebSocket connects → AI sends first message | |
| 127 | Type a response → AI streams reply | |
| 128 | Workspace panel (Code/Diagram/Notes tabs) accessible | |
| 129 | End interview → debrief generates with scores | |
| 130 | Go to Interview History → session appears with verdict | |
| 131 | Click session → transcript shows with all messages | |

### 2.12 — Team Admin Panel
| # | Test | Result |
|---|---|---|
| 132 | Navigate to Team Admin (sidebar) | |
| 133 | Stats: Problems count, Members count, Solutions count, Pinned count | |
| 134 | Problems tab: "Two Sum" shows with category badge, difficulty, solution count | |
| 135 | Search problems works | |
| 136 | Pin toggle: click 📌 → problem becomes pinned → pin count updates | |
| 137 | Hide toggle: click "Visible" → changes to "Hidden" | |
| 138 | Edit: click ✏️ → navigates to edit page with pre-filled data | |
| 139 | Edit page: change title → Save → returns to admin, title updated | |
| 140 | Members tab: shows your name with "Admin" badge and "you" tag | |
| 141 | Members tab: shows email, streak, activity status, joined date | |

### 2.13 — Team Admin Analytics
| # | Test | Result |
|---|---|---|
| 142 | Navigate to Team Analytics (sidebar) | |
| 143 | Metrics load: Members, Solutions, Problems, AI Adoption | |
| 144 | Engagement funnel renders | |
| 145 | Solutions per week chart renders | |
| 146 | Feature adoption bars render | |
| 147 | Content coverage shows category distribution | |
| 148 | Click "AI Analysis" → report generates | |

### 2.14 — Settings (Team Admin)
| # | Test | Result |
|---|---|---|
| 149 | Navigate to Settings | |
| 150 | Profile section: name, avatar color picker | |
| 151 | Team section shows: team name, role "Team Admin", "Manage" button | |
| 152 | Interview Goals: target company, interview date, preferred language | |
| 153 | Set target company "Google" + future interview date → Save | |
| 154 | Return to Dashboard → interview countdown shows | |
| 155 | Change Password section: enter current + new → "Update Password" appears | |
| 156 | Change Email section: enter new email → "Send Verification Code" | |
| 157 | Appearance: theme toggle works | |
| 158 | Account info: role, email verified (Yes), member since date | |

### 2.15 — Command Palette (Team Admin)
| # | Test | Result |
|---|---|---|
| 159 | Press ⌘K → palette opens | |
| 160 | "Navigate" group: Dashboard, Problems, Review Queue, etc. | |
| 161 | "Admin" group: Admin Panel, Add Problem, Team Analytics | |
| 162 | Type "two" → "Two Sum" appears in Problems section | |
| 163 | Click "Two Sum" → navigates to problem detail | |
| 164 | Solved indicator (✓) shows next to "Two Sum" | |

---

## Phase 3: Individual Mode (New User)

### 3.0 — Registration
| # | Test | Result |
|---|---|---|
| 165 | Open incognito/new browser | |
| 166 | Navigate to `/auth/register` | |
| 167 | Fill: name, email, password → click Register | |
| 168 | Redirects to email verification page | |
| 169 | Enter 6-digit code → verify → auto-login | |
| 170 | Redirects to onboarding page | |

### 3.1 — Onboarding (Individual)
| # | Test | Result |
|---|---|---|
| 171 | Onboarding shows 3 options: Join Team, Create Team, Solo | |
| 172 | Select "Solo" / Individual mode | |
| 173 | Redirects to Dashboard | |
| 174 | Dashboard shows "Your Dashboard" (not a team name) | |

### 3.2 — Individual Mode Basics
| # | Test | Result |
|---|---|---|
| 175 | Sidebar shows "My Practice" in team switcher | |
| 176 | Sidebar does NOT show "Leaderboard" | |
| 177 | Problems page shows empty state | |
| 178 | Quiz works (generate + take + results) | |
| 179 | Settings shows "Individual Mode" in team section | |
| 180 | Settings shows "Join Team" button | |

---

## Phase 4: Cross-Cutting Checks

### 4.1 — Console Errors
| # | Test | Result |
|---|---|---|
| 181 | SuperAdmin flow: zero red console errors throughout | |
| 182 | Team Admin flow: zero red console errors throughout | |
| 183 | Individual mode: zero red console errors throughout | |

### 4.2 — Page Refresh Resilience
| # | Test | Result |
|---|---|---|
| 184 | Refresh SuperAdmin Dashboard → stays on page, data reloads | |
| 185 | Refresh Problems page → stays on page, problems reload | |
| 186 | Refresh Problem Detail → stays on page, problem loads | |
| 187 | Refresh Quiz (mid-quiz) → returns to setup (acceptable) | |
| 188 | Refresh Settings → stays on page, form repopulates | |
| 189 | Refresh Platform Analytics → analysis still shows (persisted) | |

### 4.3 — Theme
| # | Test | Result |
|---|---|---|
| 190 | Toggle dark → light → dark | |
| 191 | All pages readable in both themes | |
| 192 | No invisible text or broken borders in light mode | |

---

## Results Summary

| Phase | Total Tests | Pass | Fail | Visual Issues |
|---|---|---|---|---|
| 1. SuperAdmin | 50 | | | |
| 2. Team Admin | 114 | | | |
| 3. Individual | 16 | | | |
| 4. Cross-Cutting | 12 | | | |
| **TOTAL** | **192** | | | |

### Failures to fix:
1.
2.
3.

### Visual issues to address:
1.
2.
3.

### Console errors observed:
1.
2.
3.