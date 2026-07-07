// client/src/pages/docs/howto/useEffectiveRole.js
//
// Shared role-detection hook for HowToShell + TaskPage. Reads user role
// from useAuthStore, honors the ?viewAs= URL override (admins only),
// and returns everything both callers need.
//
// TEAM_ADMIN may set viewAs=member. SUPER_ADMIN may set viewAs=member
// or viewAs=team-admin. Any other combination is ignored — the user's
// actual role wins.

import { useLocation } from 'react-router-dom'
import useAuthStore from '@store/useAuthStore'

export function useEffectiveRole() {
    const user = useAuthStore(s => s.user)
    const location = useLocation()

    const isSuperAdmin = user?.globalRole === 'SUPER_ADMIN'
    const isTeamAdmin  = !isSuperAdmin && user?.teamRole === 'TEAM_ADMIN'
    const actualRole   = isSuperAdmin ? 'super-admin' : isTeamAdmin ? 'team-admin' : 'member'

    const viewAs = new URLSearchParams(location.search).get('viewAs')
    const viewAsValid =
        viewAs === 'member' && (isSuperAdmin || isTeamAdmin) ? 'member' :
        viewAs === 'team-admin' && isSuperAdmin ? 'team-admin' :
        null

    return {
        actualRole,
        effectiveRole: viewAsValid || actualRole,
        viewAsActive: !!viewAsValid,
        isSuperAdmin,
        isTeamAdmin,
    }
}
