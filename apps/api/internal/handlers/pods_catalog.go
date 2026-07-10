package handlers

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/MaxwellCaron/kamino/internal/principals"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

func (h *PodsHandler) ListPublished(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		writeUnauthorized(c)
		return
	}
	if !requireManagementPermission(c, h.Authz, principalID, authorization.ManagementPermissionManager) {
		return
	}

	q := database.New(h.DB)
	rows, err := q.ListPublishedPods(c.Request.Context())
	if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to load published pods", "list published pods", err)
		return
	}

	pods, err := h.hydratePublishedPods(c.Request.Context(), q, listPublishedRowsToBase(rows))
	if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to load published pod details", "hydrate published pods", err)
		return
	}

	c.JSON(http.StatusOK, pods)
}

func (h *PodsHandler) ListCatalog(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		writeUnauthorized(c)
		return
	}

	q := database.New(h.DB)
	isProtected, err := h.Authz.HasProtectedAccess(c.Request.Context(), principalID)
	if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "authorization failed", "authorize published pod catalog", err)
		return
	}

	var bases []publishedPodBase
	if isProtected {
		rows, err := q.ListPublishedPods(c.Request.Context())
		if err != nil {
			writeLoggedError(c, http.StatusInternalServerError, "failed to load pod catalog", "list protected published pod catalog", err)
			return
		}
		for _, row := range listPublishedRowsToBase(rows) {
			if row.Status == database.PublishedPodStatusListed {
				bases = append(bases, row)
			}
		}
	} else {
		rows, err := q.ListVisiblePublishedPodsForPrincipal(c.Request.Context(), principalID)
		if err != nil {
			writeLoggedError(c, http.StatusInternalServerError, "failed to load pod catalog", "list visible published pod catalog", err)
			return
		}
		bases = visiblePublishedRowsToBase(rows)
	}

	pods, err := h.hydratePublishedPods(c.Request.Context(), q, bases)
	if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to load pod catalog details", "hydrate visible published pods", err)
		return
	}

	c.JSON(http.StatusOK, pods)
}

func (h *PodsHandler) GetCatalogPod(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		writeUnauthorized(c)
		return
	}

	slug := strings.TrimSpace(c.Param("slug"))
	if slug == "" {
		writeInvalidRequest(c, "invalid slug")
		return
	}

	q := database.New(h.DB)
	isProtected, err := h.Authz.HasProtectedAccess(c.Request.Context(), principalID)
	if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "authorization failed", "authorize published pod catalog item", err)
		return
	}

	var bases []publishedPodBase
	if isProtected {
		rows, err := q.ListPublishedPods(c.Request.Context())
		if err != nil {
			writeLoggedError(c, http.StatusInternalServerError, "failed to load pod", "list protected published pods for slug", err)
			return
		}
		for _, row := range listPublishedRowsToBase(rows) {
			if row.Slug == slug && row.Status == database.PublishedPodStatusListed {
				bases = []publishedPodBase{row}
				break
			}
		}
	} else {
		row, err := q.GetVisiblePublishedPodBySlug(c.Request.Context(), database.GetVisiblePublishedPodBySlugParams{
			Slug:        slug,
			PrincipalID: principalID,
		})
		if errors.Is(err, pgx.ErrNoRows) {
			c.JSON(http.StatusNotFound, gin.H{"error": "pod not found"})
			return
		}
		if err != nil {
			writeLoggedError(c, http.StatusInternalServerError, "failed to load pod", "get visible published pod by slug", err)
			return
		}
		bases = []publishedPodBase{visiblePublishedSlugRowToBase(row)}
	}

	if len(bases) == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "pod not found"})
		return
	}

	pods, err := h.hydratePublishedPods(c.Request.Context(), q, bases)
	if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to load pod details", "hydrate visible published pod by slug", err)
		return
	}
	if len(pods) == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "pod not found"})
		return
	}

	c.JSON(http.StatusOK, pods[0])
}

func (h *PodsHandler) GetPublished(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		writeUnauthorized(c)
		return
	}
	if !requireManagementPermission(c, h.Authz, principalID, authorization.ManagementPermissionManager) {
		return
	}

	podID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		writeInvalidRequest(c, "invalid id")
		return
	}

	q := database.New(h.DB)
	row, err := q.GetPublishedPodByID(c.Request.Context(), podID)
	if errors.Is(err, pgx.ErrNoRows) {
		c.JSON(http.StatusNotFound, gin.H{"error": "pod not found"})
		return
	}
	if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to load published pod", "get published pod", err)
		return
	}

	pods, err := h.hydratePublishedPods(c.Request.Context(), q, []publishedPodBase{publishedRowToBase(row)})
	if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to load published pod details", "hydrate published pod", err)
		return
	}
	if len(pods) == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "pod not found"})
		return
	}

	c.JSON(http.StatusOK, pods[0])
}

func (h *PodsHandler) GetPublishedProgress(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		writeUnauthorized(c)
		return
	}
	if !requireManagementPermission(c, h.Authz, principalID, authorization.ManagementPermissionManager) {
		return
	}

	progressID := strings.TrimSpace(c.Param("id"))
	if progressID == "" {
		writeInvalidRequest(c, "invalid progress id")
		return
	}

	snapshot, ok := publishedPodProgress.get(progressID)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "progress not found"})
		return
	}

	c.JSON(http.StatusOK, snapshot)
}

func (h *PodsHandler) ListPublishedPodClones(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		writeUnauthorized(c)
		return
	}
	if !requireManagementPermission(c, h.Authz, principalID, authorization.ManagementPermissionManager) {
		return
	}

	podID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		writeInvalidRequest(c, "invalid id")
		return
	}

	q := database.New(h.DB)
	if _, err := q.GetPublishedPodByID(c.Request.Context(), podID); errors.Is(err, pgx.ErrNoRows) {
		c.JSON(http.StatusNotFound, gin.H{"error": "pod not found"})
		return
	} else if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to load published pod", "load published pod for clone list", err)
		return
	}

	clones, err := h.hydratePublishedPodClones(c.Request.Context(), q, podID)
	if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to load published pod clones", "hydrate published pod clones", err)
		return
	}

	c.JSON(http.StatusOK, clones)
}

func (h *PodsHandler) hydratePublishedPodClones(
	ctx context.Context,
	q *database.Queries,
	podID uuid.UUID,
) ([]publishedPodCloneResponse, error) {
	summaries, err := q.ListClonedPodSummariesByPodID(ctx, podID)
	if err != nil {
		return nil, err
	}
	if len(summaries) == 0 {
		return []publishedPodCloneResponse{}, nil
	}

	cloneIDs := make([]uuid.UUID, 0, len(summaries))
	for _, s := range summaries {
		cloneIDs = append(cloneIDs, s.ID)
	}

	statusByClone, err := h.clonedPodRuntimeStatusByCloneIDs(ctx, q, cloneIDs)
	if err != nil {
		return nil, err
	}

	response := make([]publishedPodCloneResponse, 0, len(summaries))
	for _, s := range summaries {
		progress := 0.0
		if s.TaskTotal > 0 {
			progress = (float64(s.TaskCompleted) / float64(s.TaskTotal)) * 100
		}

		network, err := h.clonedPodNetworkMetadata(s.NetworkNumber)
		if err != nil {
			return nil, fmt.Errorf("clone %s network metadata: %w", s.ID, err)
		}

		response = append(response, publishedPodCloneResponse{
			ID:    s.ID,
			PodID: s.PodID,
			Owner: publishedPodCloneOwnerResponse{
				ID:          s.UserPrincipalID,
				Type:        string(s.PrincipalType),
				Label:       s.UserLabel,
				Description: s.UserDescription,
			},
			ClonedAt:  s.CreatedAt.Time,
			UpdatedAt: s.UpdatedAt.Time,
			Status:    statusByClone[s.ID],
			Network:   network,
			VMCount:   int32(s.VmCount),
			TaskSummary: publishedPodCloneTaskSummaryResponse{
				Total:     s.TaskTotal,
				Completed: s.TaskCompleted,
				Progress:  progress,
			},
		})
	}

	return response, nil
}

func (h *PodsHandler) hydratePublishedPods(
	ctx context.Context,
	q *database.Queries,
	bases []publishedPodBase,
) ([]publishedPodResponse, error) {
	if len(bases) == 0 {
		return []publishedPodResponse{}, nil
	}

	podIDs := make([]uuid.UUID, 0, len(bases))
	for _, pod := range bases {
		podIDs = append(podIDs, pod.ID)
	}

	creators, err := q.ListPublishedPodCreatorsByPodIDs(ctx, podIDs)
	if err != nil {
		return nil, err
	}
	audience, err := q.ListPublishedPodAudienceByPodIDs(ctx, podIDs)
	if err != nil {
		return nil, err
	}
	vms, err := q.ListPublishedPodVMsByPodIDs(ctx, podIDs)
	if err != nil {
		return nil, err
	}
	taskRows, err := q.ListPublishedPodTasksByPodIDs(ctx, podIDs)
	if err != nil {
		return nil, err
	}

	creatorsByPod := make(map[uuid.UUID][]publishedPodPrincipalResponse, len(bases))
	for _, row := range creators {
		creatorsByPod[row.PodID] = append(creatorsByPod[row.PodID], publishedPrincipalFromCreator(row))
	}
	audienceByPod := make(map[uuid.UUID][]publishedPodPrincipalResponse, len(bases))
	for _, row := range audience {
		audienceByPod[row.PodID] = append(audienceByPod[row.PodID], publishedPrincipalFromAudience(row))
	}
	vmsByPod := make(map[uuid.UUID][]publishedPodVMResponse, len(bases))
	for _, row := range vms {
		vmsByPod[row.PodID] = append(vmsByPod[row.PodID], publishedVMFromRow(row))
	}

	taskIDs := make([]uuid.UUID, 0, len(taskRows))
	tasksByPod := make(map[uuid.UUID][]*publishedPodTaskResponse, len(bases))
	tasksByID := make(map[uuid.UUID]*publishedPodTaskResponse, len(taskRows))
	for _, row := range taskRows {
		task := &publishedPodTaskResponse{
			ID:        row.ID,
			Title:     row.Title,
			Content:   row.Content,
			Questions: []publishedPodQuestionResponse{},
		}
		taskIDs = append(taskIDs, row.ID)
		tasksByID[row.ID] = task
		tasksByPod[row.PodID] = append(tasksByPod[row.PodID], task)
	}
	if len(taskIDs) > 0 {
		questions, err := q.ListPublishedPodQuestionsByTaskIDs(ctx, taskIDs)
		if err != nil {
			return nil, err
		}
		for _, row := range questions {
			task, ok := tasksByID[row.TaskID]
			if !ok {
				continue
			}
			task.Questions = append(task.Questions, publishedQuestionFromRow(row))
		}
	}

	response := make([]publishedPodResponse, 0, len(bases))
	for _, base := range bases {
		taskResponses := make([]publishedPodTaskResponse, 0, len(tasksByPod[base.ID]))
		for _, task := range tasksByPod[base.ID] {
			taskResponses = append(taskResponses, *task)
		}

		response = append(response, publishedPodResponse{
			ID:              base.ID,
			Title:           base.Title,
			Slug:            base.Slug,
			Description:     base.Description,
			Image:           base.ImageURL,
			Creators:        nonNilPrincipals(creatorsByPod[base.ID]),
			CreatedAt:       base.CreatedAt,
			CloneCount:      base.CloneCount,
			Status:          string(base.Status),
			Audience:        nonNilPrincipals(audienceByPod[base.ID]),
			Tasks:           taskResponses,
			SourceFolder:    base.SourceFolderID,
			VirtualMachines: nonNilVMs(vmsByPod[base.ID]),
		})
	}

	return response, nil
}

func publishedVMFromRow(row database.ListPublishedPodVMsByPodIDsRow) publishedPodVMResponse {
	return publishedPodVMResponse{
		ID:        row.SourceInventoryItemID,
		Name:      row.Name,
		CPUCount:  row.CpuCount,
		MemoryGB:  memoryMBToGB(&row.MemoryMb),
		StorageGB: diskGBToInt(&row.DiskGb),
		Permissions: publishedPodPermissionResponse{
			AllowMask: row.AllowMask,
			DenyMask:  row.DenyMask,
		},
	}
}

func publishedQuestionFromRow(row database.ListPublishedPodQuestionsByTaskIDsRow) publishedPodQuestionResponse {
	return publishedPodQuestionResponse{
		ID:            row.ID,
		Title:         row.Title,
		AnswerOutline: row.AnswerOutline,
		Description:   row.Description,
		Hint:          row.Hint,
	}
}

func publishedPrincipalFromCreator(row database.ListPublishedPodCreatorsByPodIDsRow) publishedPodPrincipalResponse {
	return publishedPrincipal(row.ID, row.PrincipalType, row.ExternalID, row.Name, row.FullName, row.Description)
}

func publishedPrincipalFromAudience(row database.ListPublishedPodAudienceByPodIDsRow) publishedPodPrincipalResponse {
	return publishedPrincipal(row.ID, row.PrincipalType, row.ExternalID, row.Name, row.FullName, row.Description)
}

func publishedPrincipal(
	id uuid.UUID,
	principalType database.PrincipalType,
	externalID string,
	name *string,
	fullName *string,
	description *string,
) publishedPodPrincipalResponse {
	label := principals.FormatReference(name, fullName, externalID)
	descriptionValue := externalID
	if description != nil && strings.TrimSpace(*description) != "" {
		descriptionValue = *description
	}

	return publishedPodPrincipalResponse{
		ID:          id,
		Type:        string(principalType),
		Label:       label,
		Description: descriptionValue,
	}
}

func listPublishedRowsToBase(rows []database.ListPublishedPodsRow) []publishedPodBase {
	bases := make([]publishedPodBase, 0, len(rows))
	for _, row := range rows {
		bases = append(bases, publishedPodBase{
			ID:             row.ID,
			Title:          row.Title,
			Slug:           row.Slug,
			Description:    row.Description,
			ImageURL:       row.ImageUrl,
			Status:         row.Status,
			SourceFolderID: row.SourceFolderID,
			CloneCount:     row.CloneCount,
			CreatedAt:      optionalTime(row.CreatedAt),
		})
	}
	return bases
}

func visiblePublishedRowsToBase(rows []database.ListVisiblePublishedPodsForPrincipalRow) []publishedPodBase {
	bases := make([]publishedPodBase, 0, len(rows))
	for _, row := range rows {
		bases = append(bases, publishedPodBase{
			ID:             row.ID,
			Title:          row.Title,
			Slug:           row.Slug,
			Description:    row.Description,
			ImageURL:       row.ImageUrl,
			Status:         row.Status,
			SourceFolderID: row.SourceFolderID,
			CloneCount:     row.CloneCount,
			CreatedAt:      optionalTime(row.CreatedAt),
		})
	}
	return bases
}

func publishedRowToBase(row database.GetPublishedPodByIDRow) publishedPodBase {
	return publishedPodBase{
		ID:             row.ID,
		Title:          row.Title,
		Slug:           row.Slug,
		Description:    row.Description,
		ImageURL:       row.ImageUrl,
		Status:         row.Status,
		SourceFolderID: row.SourceFolderID,
		CloneCount:     row.CloneCount,
		CreatedAt:      optionalTime(row.CreatedAt),
	}
}

func visiblePublishedSlugRowToBase(row database.GetVisiblePublishedPodBySlugRow) publishedPodBase {
	return publishedPodBase{
		ID:             row.ID,
		Title:          row.Title,
		Slug:           row.Slug,
		Description:    row.Description,
		ImageURL:       row.ImageUrl,
		Status:         row.Status,
		SourceFolderID: row.SourceFolderID,
		CloneCount:     row.CloneCount,
		CreatedAt:      optionalTime(row.CreatedAt),
	}
}

func nonNilPrincipals(values []publishedPodPrincipalResponse) []publishedPodPrincipalResponse {
	if values == nil {
		return []publishedPodPrincipalResponse{}
	}
	return values
}

func nonNilVMs(values []publishedPodVMResponse) []publishedPodVMResponse {
	if values == nil {
		return []publishedPodVMResponse{}
	}
	return values
}
