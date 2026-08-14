import { useState } from "react"
import { DashboardActivityTableCard } from "./dashboard-requests-card"
import { DashboardCurrentClonedPodCard } from "./dashboard-cloned-pod-card"
import { DashboardFavoritesCard } from "./dashboard-favorites-card"
import { DashboardProfileCard } from "./dashboard-profile-card"
import { DashboardQuestionActivityCard } from "./dashboard-question-activity-card"
import { DashboardRecentPodsCard } from "./dashboard-published-pods-card"
import { DashboardStatsGrid } from "./dashboard-stat-cards"
import { ChangePasswordDialog } from "./change-password-dialog"
import type { AuthUser } from "@/features/auth/types/auth-types"
import { PreloadOverlay } from "@/components/loading-overlay"
import { InlineErrorAlert } from "@/components/feedback/inline-error-alert"
import { getManagementRoleLabel } from "@/features/auth/utils/management-permissions"
import { PersonalPodCard } from "@/features/pods/components/browse/personal-pod-card"
import { useScrollRestoreOnReady } from "@/features/dashboard/hooks/use-scroll-restore-on-ready"
import { useDashboardHomeData } from "@/features/dashboard/hooks/use-dashboard-home-data"
import { RequestDetailDialog } from "@/features/requests/components/request-detail-dialog"

export function DashboardHomePage({ user }: { user: AuthUser }) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(
    null
  )
  const dashboard = useDashboardHomeData(
    selectedRequestId,
    setSelectedRequestId
  )

  useScrollRestoreOnReady(!dashboard.isLoading)

  const roleLabel = getManagementRoleLabel(user.management_permissions)

  return (
    <div className="@container/main relative flex flex-1 flex-col gap-2">
      <PreloadOverlay active={dashboard.isLoading} label="Loading dashboard" />
      <div className="grid grid-cols-1 gap-4 px-4 py-4 md:gap-6 md:py-6 lg:px-6 xl:grid-cols-12">
        {dashboard.primaryStatsError ? (
          <div className="xl:col-span-12">
            <InlineErrorAlert
              error={dashboard.primaryStatsError}
              fallback="Failed to load dashboard statistics."
              title="Statistics unavailable"
            />
          </div>
        ) : null}
        <DashboardStatsGrid className="xl:col-span-7" stats={dashboard.stats} />
        <DashboardProfileCard
          className="xl:col-span-5"
          roleLabel={roleLabel}
          user={user}
          onSettingsClick={
            dashboard.canChangeOwnPassword
              ? () => setSettingsOpen(true)
              : undefined
          }
        />
        {!dashboard.isPersonalPodLoading &&
        dashboard.personalPodStatus?.configured ? (
          <PersonalPodCard
            className="xl:col-span-12"
            status={dashboard.personalPodStatus}
            username={user.username}
          />
        ) : null}
        <DashboardQuestionActivityCard
          className="xl:col-span-4"
          data={dashboard.questionActivity.data}
          error={dashboard.questionActivity.error}
        />
        <DashboardCurrentClonedPodCard
          className="xl:col-span-8"
          entry={dashboard.cloneStatus.current}
          error={dashboard.cloneStatus.error}
        />
        <DashboardRecentPodsCard
          className="xl:col-span-7"
          clonedPodIds={dashboard.recentPods.clonedPodIds}
          error={dashboard.recentPods.error}
          pods={dashboard.recentPods.pods}
        />
        <div className="relative min-h-0 xl:col-span-5">
          <DashboardFavoritesCard
            className="max-h-144 min-h-0 xl:absolute xl:inset-0 xl:max-h-none"
            favorites={dashboard.favorites}
            isTreeLoading={dashboard.isTreeLoading}
            treeError={dashboard.treeError}
            vmStatuses={dashboard.vmStatuses}
          />
        </div>

        <DashboardActivityTableCard
          className="xl:col-span-12"
          columns={dashboard.activity.columns}
          data={dashboard.activity.data}
          error={dashboard.activity.error}
        />
      </div>

      <>
        {settingsOpen && dashboard.canChangeOwnPassword ? (
          <ChangePasswordDialog
            open={settingsOpen}
            onOpenChange={setSettingsOpen}
          />
        ) : null}
        {selectedRequestId !== null && (
          <RequestDetailDialog
            canReview={false}
            error={dashboard.requestDetailError}
            isLoading={dashboard.isRequestDetailLoading}
            onApprove={() => {}}
            onDeny={() => {}}
            onOpenChange={(open) => {
              if (!open) {
                setSelectedRequestId(null)
              }
            }}
            open={true}
            request={dashboard.requestDetail ?? null}
            tree={dashboard.tree}
          />
        )}
      </>
    </div>
  )
}
