package handlers

import (
	"context"
	"errors"
	"fmt"
	"math"
	"net/http"
	"net/url"
	"slices"
	"sort"
	"strings"
	"time"
	"unicode"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/MaxwellCaron/kamino/internal/inventory"
	"github.com/MaxwellCaron/kamino/internal/names"
	"github.com/MaxwellCaron/kamino/internal/proxmox"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	podsFolderName               = "Pods"
	publishedPodSourceFolderName = "Source"
)

type PodsHandler struct {
	PX                   *proxmox.Client
	Importer             *proxmox.InventoryImporter
	Service              *inventory.Service
	Authz                *authorization.Service
	DB                   *pgxpool.Pool
	RouterTemplateItemID uuid.UUID
}

type publishedPodPrincipalResponse struct {
	ID          uuid.UUID `json:"id"`
	Type        string    `json:"type"`
	Label       string    `json:"label"`
	Description string    `json:"description"`
}

type publishedPodPermissionResponse struct {
	AllowMask int64 `json:"allowMask"`
	DenyMask  int64 `json:"denyMask"`
}

type publishedPodVMResponse struct {
	ID          uuid.UUID                      `json:"id"`
	Name        string                         `json:"name"`
	CPUCount    int32                          `json:"cpuCount"`
	MemoryGB    int32                          `json:"memoryGb"`
	StorageGB   int32                          `json:"storageGb"`
	Permissions publishedPodPermissionResponse `json:"permissions"`
}

type publishedPodQuestionResponse struct {
	ID            uuid.UUID `json:"id"`
	Title         string    `json:"title"`
	AnswerOutline string    `json:"answerOutline"`
	Description   *string   `json:"description,omitempty"`
	Hint          *string   `json:"hint,omitempty"`
}

type publishedPodTaskResponse struct {
	ID        uuid.UUID                      `json:"id"`
	Title     string                         `json:"title"`
	Content   string                         `json:"content"`
	Questions []publishedPodQuestionResponse `json:"questions"`
}

type publishedPodResponse struct {
	ID              uuid.UUID                       `json:"id"`
	Title           string                          `json:"title"`
	Slug            string                          `json:"slug"`
	Description     string                          `json:"description"`
	Image           string                          `json:"image"`
	Creators        []publishedPodPrincipalResponse `json:"creators"`
	CreatedAt       *time.Time                      `json:"created_at"`
	CloneCount      int32                           `json:"clone_count"`
	Status          string                          `json:"status"`
	Audience        []publishedPodPrincipalResponse `json:"audience"`
	Tasks           []publishedPodTaskResponse      `json:"tasks"`
	SourceFolder    uuid.UUID                       `json:"source_folder"`
	VirtualMachines []publishedPodVMResponse        `json:"virtual_machines"`
}

type publishSourceVMOption struct {
	ID          uuid.UUID                      `json:"id"`
	Name        string                         `json:"name"`
	CPUCount    int32                          `json:"cpuCount"`
	MemoryGB    int32                          `json:"memoryGb"`
	StorageGB   int32                          `json:"storageGb"`
	Permissions publishedPodPermissionResponse `json:"permissions"`
}

type publishSourceFolderOption struct {
	ID              uuid.UUID               `json:"id"`
	Name            string                  `json:"name"`
	Path            string                  `json:"path"`
	VirtualMachines []publishSourceVMOption `json:"virtual_machines"`
}

type publishPodPrincipalRequest struct {
	ID          string `json:"id"`
	Type        string `json:"type"`
	Label       string `json:"label"`
	Description string `json:"description"`
}

type publishPodPermissionRequest struct {
	AllowMask int64 `json:"allowMask"`
	DenyMask  int64 `json:"denyMask"`
}

type publishPodVMRequest struct {
	ID          string                      `json:"id"`
	Name        string                      `json:"name"`
	CPUCount    int32                       `json:"cpuCount"`
	MemoryGB    int32                       `json:"memoryGb"`
	StorageGB   int32                       `json:"storageGb"`
	Permissions publishPodPermissionRequest `json:"permissions"`
}

type publishPodQuestionRequest struct {
	ID            string  `json:"id"`
	Title         string  `json:"title"`
	AnswerOutline string  `json:"answerOutline"`
	Description   *string `json:"description"`
	Hint          *string `json:"hint"`
}

type publishPodTaskRequest struct {
	ID        string                      `json:"id"`
	Title     string                      `json:"title"`
	Content   string                      `json:"content"`
	Questions []publishPodQuestionRequest `json:"questions"`
}

type publishPodRequest struct {
	ID              string                       `json:"id"`
	Title           string                       `json:"title"`
	Description     string                       `json:"description"`
	Image           string                       `json:"image"`
	Creators        []publishPodPrincipalRequest `json:"creators"`
	Status          string                       `json:"status"`
	Audience        []publishPodPrincipalRequest `json:"audience"`
	SourceFolder    string                       `json:"source_folder"`
	VirtualMachines []publishPodVMRequest        `json:"virtual_machines"`
	Tasks           []publishPodTaskRequest      `json:"tasks"`
}

type updatePublishedPodStatusRequest struct {
	Status string `json:"status" binding:"required"`
}

type publishedPodBase struct {
	ID             uuid.UUID
	Title          string
	Slug           string
	Description    string
	ImageURL       string
	Status         database.PublishedPodStatus
	SourceFolderID uuid.UUID
	CloneCount     int32
	CreatedAt      *time.Time
}

const defaultPublishedPodVMAllowMask = int64(
	authorization.View |
		authorization.ConsoleVM |
		authorization.PowerVM |
		authorization.ViewSnapshots |
		authorization.SnapshotVM,
)

func (h *PodsHandler) GetPublishOptions(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}
	if !requireManagementPermission(c, h.Authz, principalID, authorization.ManagementPermissionManager) {
		return
	}

	sourceFolders, err := h.publishSourceFolders(c.Request.Context(), principalID)
	if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to load source folders", "load publish source folders", err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"source_folders": sourceFolders})
}

func (h *PodsHandler) ListPublished(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
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
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
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
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}

	slug := strings.TrimSpace(c.Param("slug"))
	if slug == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid slug"})
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
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}
	if !requireManagementPermission(c, h.Authz, principalID, authorization.ManagementPermissionManager) {
		return
	}

	podID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
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
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}
	if !requireManagementPermission(c, h.Authz, principalID, authorization.ManagementPermissionManager) {
		return
	}

	progressID := strings.TrimSpace(c.Param("id"))
	if progressID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid progress id"})
		return
	}

	snapshot, ok := publishedPodProgress.get(progressID)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "progress not found"})
		return
	}

	c.JSON(http.StatusOK, snapshot)
}

func (h *PodsHandler) SavePublished(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}
	if !requireManagementPermission(c, h.Authz, principalID, authorization.ManagementPermissionManager) {
		return
	}

	var req publishPodRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeInvalidRequest(c, "invalid request body")
		return
	}

	progress := newPublishPodProgressReporter(c.Query("progress_id"), len(req.VirtualMachines))
	progress.update(
		publishProgressStepValidating,
		0,
		"",
		"Checking the selected Pod folder and source virtual machines.",
	)

	pathID := uuid.Nil
	if c.Param("id") != "" {
		parsed, err := uuid.Parse(c.Param("id"))
		if err != nil {
			progress.fail("invalid id")
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
			return
		}
		pathID = parsed
	}

	pod, reqErr := h.savePublishedPod(c.Request.Context(), principalID, pathID, req, progress)
	if reqErr != nil {
		progress.fail(reqErr.UserMessage)
		writeRequestError(c, reqErr)
		return
	}

	progress.succeed("Published Pod saved to the catalog.")
	c.JSON(http.StatusOK, pod)
}

func (h *PodsHandler) UpdatePublishedStatus(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}
	if !requireManagementPermission(c, h.Authz, principalID, authorization.ManagementPermissionManager) {
		return
	}

	podID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	var req updatePublishedPodStatusRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeInvalidRequest(c, "invalid request body")
		return
	}

	status, err := parsePublishedPodStatus(req.Status)
	if err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": err.Error()})
		return
	}

	q := database.New(h.DB)
	if _, err := q.GetPublishedPodByID(c.Request.Context(), podID); errors.Is(err, pgx.ErrNoRows) {
		c.JSON(http.StatusNotFound, gin.H{"error": "pod not found"})
		return
	} else if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to load published pod", "load published pod for status update", err)
		return
	}

	if err := q.UpdatePublishedPodStatus(c.Request.Context(), database.UpdatePublishedPodStatusParams{
		ID:     podID,
		Status: status,
	}); err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to update published pod", "update published pod status", err)
		return
	}

	row, err := q.GetPublishedPodByID(c.Request.Context(), podID)
	if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to reload published pod", "reload published pod after status update", err)
		return
	}

	pods, err := h.hydratePublishedPods(c.Request.Context(), q, []publishedPodBase{publishedRowToBase(row)})
	if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to load published pod details", "hydrate status-updated published pod", err)
		return
	}

	c.JSON(http.StatusOK, pods[0])
}

func (h *PodsHandler) DeletePublished(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}
	if !requireManagementPermission(c, h.Authz, principalID, authorization.ManagementPermissionManager) {
		return
	}

	podID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	q := database.New(h.DB)
	deleted, err := q.DeletePublishedPod(c.Request.Context(), podID)
	if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to delete published pod", "delete published pod", err)
		return
	}
	if deleted == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "pod not found"})
		return
	}

	c.Status(http.StatusNoContent)
}

type podTemplateOption struct {
	ID               uuid.UUID `json:"id"`
	Name             string    `json:"name"`
	Node             string    `json:"node"`
	VMID             int32     `json:"vmid"`
	CPUCount         *int32    `json:"cpu_count,omitempty"`
	MemoryMB         *int32    `json:"memory_mb,omitempty"`
	DiskGB           *float64  `json:"disk_gb,omitempty"`
	IsRouterTemplate bool      `json:"is_router_template"`
}

type podCreateOptionsResponse struct {
	RouterTemplateConfigured bool                `json:"router_template_configured"`
	Templates                []podTemplateOption `json:"templates"`
}

type podNameAvailabilityResponse struct {
	Available bool `json:"available"`
}

type createPodVMRequest struct {
	Name      string `json:"name" binding:"required"`
	CPUCount  int    `json:"cpu_count"`
	MemoryGB  int    `json:"memory_gb"`
	StorageGB int    `json:"storage_gb"`
}

type createPodTemplateRequest struct {
	TemplateItemID string               `json:"template_item_id" binding:"required"`
	VMs            []createPodVMRequest `json:"vms" binding:"required,min=1"`
}

type createPodRequest struct {
	Name          string                     `json:"name" binding:"required"`
	IncludeRouter bool                       `json:"include_router"`
	Templates     []createPodTemplateRequest `json:"templates"`
}

type createPodVMResponse struct {
	TemplateItemID uuid.UUID     `json:"template_item_id"`
	VMID           int           `json:"vmid"`
	ItemID         uuid.UUID     `json:"item_id"`
	Item           InventoryItem `json:"item"`
}

type createPodResponse struct {
	OK       bool                  `json:"ok"`
	FolderID uuid.UUID             `json:"folder_id"`
	VMs      []createPodVMResponse `json:"vms"`
}

type podCloneSpec struct {
	TemplateItemID uuid.UUID
	Name           string
	Hardware       *podCloneHardware
}

type podCloneHardware struct {
	CPUCount  int
	MemoryGB  int
	StorageGB int
}

func (h *PodsHandler) GetCreateOptions(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}
	if !requireManagementPermission(c, h.Authz, principalID, authorization.ManagementPermissionManager) {
		return
	}

	rows, err := h.Service.GetVisibleInventoryItems(c.Request.Context(), principalID)
	if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to load templates", "load pod template options", err)
		return
	}

	templates := make([]podTemplateOption, 0)
	for _, row := range rows {
		if row.Kind != database.InventoryItemKindVm || row.IsTemplate == nil || !*row.IsTemplate {
			continue
		}
		if row.Node == nil || row.Vmid == nil {
			continue
		}

		allowed, err := h.Authz.Has(c.Request.Context(), principalID, row.ID, authorization.CloneVM)
		if err != nil {
			writeLoggedError(c, http.StatusInternalServerError, "authorization failed", "authorize pod template option", err)
			return
		}
		if !allowed {
			continue
		}

		isRouterTemplate := h.RouterTemplateItemID != uuid.Nil && row.ID == h.RouterTemplateItemID
		if isRouterTemplate {
			continue
		}

		templates = append(templates, podTemplateOption{
			ID:               row.ID,
			Name:             row.Name,
			Node:             *row.Node,
			VMID:             *row.Vmid,
			CPUCount:         row.CpuCount,
			MemoryMB:         row.MemoryMb,
			DiskGB:           row.DiskGb,
			IsRouterTemplate: isRouterTemplate,
		})
	}

	c.JSON(http.StatusOK, podCreateOptionsResponse{
		RouterTemplateConfigured: h.RouterTemplateItemID != uuid.Nil,
		Templates:                templates,
	})
}

func (h *PodsHandler) ValidateCreateName(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}
	if !requireManagementPermission(c, h.Authz, principalID, authorization.ManagementPermissionManager) {
		return
	}

	name := names.Normalize(c.Query("name"))
	if err := names.ValidateFolder(name); err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": err.Error()})
		return
	}

	podsFolderID, found, err := h.Service.FindFolderPath(c.Request.Context(), []string{podsFolderName})
	if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to validate pod name", "find pods folder for name validation", err)
		return
	}
	if !found {
		c.JSON(http.StatusOK, podNameAvailabilityResponse{Available: true})
		return
	}
	if !requireInventoryPermission(c, h.Authz, principalID, podsFolderID, authorization.CreateFolder) {
		return
	}

	exists, err := h.Service.ChildFolderExists(c.Request.Context(), podsFolderID, name)
	if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to validate pod name", "check pod folder name availability", err)
		return
	}

	c.JSON(http.StatusOK, podNameAvailabilityResponse{Available: !exists})
}

func (h *PodsHandler) Create(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}
	if !requireManagementPermission(c, h.Authz, principalID, authorization.ManagementPermissionManager) {
		return
	}

	var req createPodRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeInvalidRequest(c, "invalid request body")
		return
	}

	req.Name = names.Normalize(req.Name)
	if err := names.ValidateFolder(req.Name); err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": err.Error()})
		return
	}

	specs, err := h.buildCloneSpecs(req)
	if err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": err.Error()})
		return
	}

	podsFolderID, err := h.Service.EnsureFolderPath(c.Request.Context(), []string{podsFolderName})
	if err != nil {
		writeInventoryError(c, err)
		return
	}
	if !requireInventoryPermission(c, h.Authz, principalID, podsFolderID, authorization.CreateFolder) {
		return
	}
	if len(specs) > 0 && !requireInventoryPermission(c, h.Authz, principalID, podsFolderID, authorization.CreateVM) {
		return
	}

	podFolderID, err := h.Service.CreateFolder(c.Request.Context(), podsFolderID, req.Name)
	if err != nil {
		writeInventoryError(c, err)
		return
	}

	if len(specs) > 0 {
		if !requireInventoryPermission(c, h.Authz, principalID, podFolderID, authorization.CreateVM) {
			return
		}
		if err := h.Service.EnsureFolderHasVMCapacity(c.Request.Context(), podFolderID, int32(len(specs))); err != nil {
			writeInventoryError(c, err)
			return
		}
	}

	createdVMs := make([]createPodVMResponse, 0, len(specs))
	for _, spec := range specs {
		created, reqErr := h.cloneTemplateIntoPod(c.Request.Context(), principalID, podFolderID, spec)
		if reqErr != nil {
			writeRequestError(c, reqErr)
			return
		}
		createdVMs = append(createdVMs, created)
	}

	c.JSON(http.StatusOK, createPodResponse{
		OK:       true,
		FolderID: podFolderID,
		VMs:      createdVMs,
	})
}

func (h *PodsHandler) publishSourceFolders(
	ctx context.Context,
	principalID uuid.UUID,
) ([]publishSourceFolderOption, error) {
	podsFolderID, found, err := h.Service.FindFolderPath(ctx, []string{podsFolderName})
	if err != nil {
		return nil, err
	}
	if !found {
		return []publishSourceFolderOption{}, nil
	}

	rows, err := h.Service.GetVisibleInventoryItems(ctx, principalID)
	if err != nil {
		return nil, err
	}

	rowsByID := make(map[uuid.UUID]database.GetVisibleInventoryItemsForPrincipalRow, len(rows))
	for _, row := range rows {
		rowsByID[row.ID] = row
	}

	folders := make(map[uuid.UUID]*publishSourceFolderOption, len(rows))
	for _, row := range rows {
		if row.Kind != database.InventoryItemKindFolder {
			continue
		}
		if row.ID == podsFolderID || !isInventoryDescendantOf(row.ID, podsFolderID, rowsByID) {
			continue
		}
		if !maskHas(row.AllowedMask, authorization.View) {
			continue
		}
		folders[row.ID] = &publishSourceFolderOption{
			ID:   row.ID,
			Name: row.Name,
			Path: inventoryPath(row.ID, rowsByID),
		}
	}

	for _, row := range rows {
		if row.Kind != database.InventoryItemKindVm || row.ParentID == nil {
			continue
		}
		if row.IsTemplate != nil && *row.IsTemplate {
			continue
		}
		if !maskHas(row.AllowedMask, authorization.View) {
			continue
		}

		folder, ok := folders[*row.ParentID]
		if !ok {
			continue
		}
		folder.VirtualMachines = append(folder.VirtualMachines, publishSourceVMOption{
			ID:        row.ID,
			Name:      row.Name,
			CPUCount:  positiveHardwareInt(row.CpuCount),
			MemoryGB:  memoryMBToGB(row.MemoryMb),
			StorageGB: diskGBToInt(row.DiskGb),
			Permissions: publishedPodPermissionResponse{
				AllowMask: defaultPublishedPodVMAllowMask,
				DenyMask:  0,
			},
		})
	}

	options := make([]publishSourceFolderOption, 0, len(folders))
	for _, folder := range folders {
		if len(folder.VirtualMachines) == 0 {
			continue
		}
		options = append(options, *folder)
	}
	sort.SliceStable(options, func(i, j int) bool {
		left := strings.ToLower(options[i].Path)
		right := strings.ToLower(options[j].Path)
		if left != right {
			return left < right
		}
		return options[i].Path < options[j].Path
	})

	return options, nil
}

func (h *PodsHandler) savePublishedPod(
	ctx context.Context,
	principalID uuid.UUID,
	pathID uuid.UUID,
	req publishPodRequest,
	progress *publishPodProgressReporter,
) (publishedPodResponse, *requestError) {
	normalized, reqErr := h.normalizePublishPodRequest(ctx, principalID, pathID, req)
	if reqErr != nil {
		return publishedPodResponse{}, reqErr
	}

	reloadQ := database.New(h.DB)
	existingRow, err := reloadQ.GetPublishedPodByID(ctx, normalized.ID)
	exists := err == nil
	if errors.Is(err, pgx.ErrNoRows) && pathID != uuid.Nil {
		return publishedPodResponse{}, &requestError{
			Status:      http.StatusNotFound,
			UserMessage: "pod not found",
		}
	}
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return publishedPodResponse{}, &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "failed to load published pod",
			Operation:   "load published pod before save",
			Err:         err,
		}
	}

	if exists && existingRow.SourceFolderID == normalized.SourceFolderID {
		existingVMs, err := reloadQ.ListPublishedPodVMsByPodIDs(ctx, []uuid.UUID{normalized.ID})
		if err != nil {
			return publishedPodResponse{}, &requestError{
				Status:      http.StatusInternalServerError,
				UserMessage: "failed to load published pod VMs",
				Operation:   "load existing published pod VMs before save",
				Err:         err,
			}
		}
		normalized.VirtualMachines, reqErr = preservePublishedPodSourceTemplates(normalized.VirtualMachines, existingVMs)
		if reqErr != nil {
			return publishedPodResponse{}, reqErr
		}
	} else {
		normalized.VirtualMachines, reqErr = h.preparePublishedPodSourceTemplates(ctx, principalID, normalized, progress)
		if reqErr != nil {
			return publishedPodResponse{}, reqErr
		}
	}

	progress.update(
		publishProgressStepSaving,
		len(normalized.VirtualMachines),
		"",
		"Writing the published Pod metadata to the catalog.",
	)

	tx, err := h.DB.Begin(ctx)
	if err != nil {
		return publishedPodResponse{}, &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "failed to save published pod",
			Operation:   "begin published pod tx",
			Err:         err,
		}
	}
	defer tx.Rollback(ctx)

	q := database.New(tx)

	slug, err := h.uniquePublishedPodSlug(ctx, q, normalized.Title, normalized.ID)
	if err != nil {
		return publishedPodResponse{}, &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "failed to allocate pod slug",
			Operation:   "allocate published pod slug",
			Err:         err,
		}
	}

	if exists {
		if _, err := q.UpdatePublishedPod(ctx, database.UpdatePublishedPodParams{
			ID:             normalized.ID,
			Title:          normalized.Title,
			Slug:           slug,
			Description:    normalized.Description,
			ImageUrl:       normalized.Image,
			Status:         normalized.Status,
			SourceFolderID: normalized.SourceFolderID,
		}); err != nil {
			return publishedPodResponse{}, &requestError{
				Status:      http.StatusInternalServerError,
				UserMessage: "failed to update published pod",
				Operation:   "update published pod",
				Err:         err,
			}
		}

		if err := h.replacePublishedPodChildren(ctx, q, normalized); err != nil {
			return publishedPodResponse{}, err
		}
	} else {
		if _, err := q.CreatePublishedPod(ctx, database.CreatePublishedPodParams{
			ID:                   normalized.ID,
			Title:                normalized.Title,
			Slug:                 slug,
			Description:          normalized.Description,
			ImageUrl:             normalized.Image,
			Status:               normalized.Status,
			SourceFolderID:       normalized.SourceFolderID,
			PublisherPrincipalID: principalID,
		}); err != nil {
			return publishedPodResponse{}, &requestError{
				Status:      http.StatusInternalServerError,
				UserMessage: "failed to create published pod",
				Operation:   "create published pod",
				Err:         err,
			}
		}

		if err := h.replacePublishedPodChildren(ctx, q, normalized); err != nil {
			return publishedPodResponse{}, err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return publishedPodResponse{}, &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "failed to save published pod",
			Operation:   "commit published pod tx",
			Err:         err,
		}
	}

	row, err := reloadQ.GetPublishedPodByID(ctx, normalized.ID)
	if err != nil {
		return publishedPodResponse{}, &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "failed to reload published pod",
			Operation:   "reload published pod after save",
			Err:         err,
		}
	}
	pods, err := h.hydratePublishedPods(ctx, reloadQ, []publishedPodBase{publishedRowToBase(row)})
	if err != nil {
		return publishedPodResponse{}, &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "failed to load published pod details",
			Operation:   "hydrate saved published pod",
			Err:         err,
		}
	}
	if len(pods) == 0 {
		return publishedPodResponse{}, &requestError{
			Status:      http.StatusNotFound,
			UserMessage: "pod not found",
		}
	}

	return pods[0], nil
}

type normalizedPublishPodRequest struct {
	ID              uuid.UUID
	Title           string
	Description     string
	Image           string
	Status          database.PublishedPodStatus
	SourceFolderID  uuid.UUID
	CreatorIDs      []uuid.UUID
	AudienceIDs     []uuid.UUID
	VirtualMachines []normalizedPublishPodVM
	Tasks           []normalizedPublishPodTask
}

type normalizedPublishPodVM struct {
	RequestInventoryItemID uuid.UUID
	SourceInventoryItemID  uuid.UUID
	Name                   string
	CPUCount               int32
	MemoryGB               int32
	StorageGB              int32
	AllowMask              int64
	DenyMask               int64
}

type normalizedPublishPodTask struct {
	ID        uuid.UUID
	Title     string
	Content   string
	Questions []normalizedPublishPodQuestion
}

type normalizedPublishPodQuestion struct {
	ID            uuid.UUID
	Title         string
	AnswerOutline string
	Description   *string
	Hint          *string
}

func (h *PodsHandler) normalizePublishPodRequest(
	ctx context.Context,
	principalID uuid.UUID,
	pathID uuid.UUID,
	req publishPodRequest,
) (normalizedPublishPodRequest, *requestError) {
	podID := pathID
	if podID == uuid.Nil {
		if strings.TrimSpace(req.ID) != "" {
			parsed, err := uuid.Parse(req.ID)
			if err != nil {
				return normalizedPublishPodRequest{}, invalidPublishPod("invalid pod id")
			}
			podID = parsed
		} else {
			podID = uuid.New()
		}
	} else if strings.TrimSpace(req.ID) != "" && req.ID != podID.String() {
		return normalizedPublishPodRequest{}, invalidPublishPod("request id does not match route id")
	}

	title := strings.TrimSpace(req.Title)
	if title == "" || len(title) > 32 {
		return normalizedPublishPodRequest{}, invalidPublishPod("title must be between 1 and 32 characters")
	}
	description := strings.TrimSpace(req.Description)
	if description == "" || len(description) > 128 {
		return normalizedPublishPodRequest{}, invalidPublishPod("description must be between 1 and 128 characters")
	}
	image := strings.TrimSpace(req.Image)
	if _, err := url.ParseRequestURI(image); image == "" || err != nil {
		return normalizedPublishPodRequest{}, invalidPublishPod("image must be a valid URL")
	}
	status, err := parsePublishedPodStatus(req.Status)
	if err != nil {
		return normalizedPublishPodRequest{}, invalidPublishPod(err.Error())
	}

	sourceFolderID, err := uuid.Parse(req.SourceFolder)
	if err != nil {
		return normalizedPublishPodRequest{}, invalidPublishPod("select a source folder")
	}
	sourceFolders, err := h.publishSourceFolders(ctx, principalID)
	if err != nil {
		return normalizedPublishPodRequest{}, &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "failed to load source folders",
			Operation:   "load source folders for published pod validation",
			Err:         err,
		}
	}

	sourceFolder, ok := findSourceFolder(sourceFolders, sourceFolderID)
	if !ok {
		return normalizedPublishPodRequest{}, invalidPublishPod("source folder is not available")
	}

	creatorIDs, reqErr := normalizePrincipalRequests(ctx, database.New(h.DB), req.Creators, 1, 5, "creator")
	if reqErr != nil {
		return normalizedPublishPodRequest{}, reqErr
	}
	audienceIDs, reqErr := normalizePrincipalRequests(ctx, database.New(h.DB), req.Audience, 0, 1<<31-1, "audience")
	if reqErr != nil {
		return normalizedPublishPodRequest{}, reqErr
	}

	vms, reqErr := normalizePublishPodVMs(req.VirtualMachines, sourceFolder.VirtualMachines)
	if reqErr != nil {
		return normalizedPublishPodRequest{}, reqErr
	}
	tasks, reqErr := normalizePublishPodTasks(req.Tasks)
	if reqErr != nil {
		return normalizedPublishPodRequest{}, reqErr
	}

	return normalizedPublishPodRequest{
		ID:              podID,
		Title:           title,
		Description:     description,
		Image:           image,
		Status:          status,
		SourceFolderID:  sourceFolderID,
		CreatorIDs:      creatorIDs,
		AudienceIDs:     audienceIDs,
		VirtualMachines: vms,
		Tasks:           tasks,
	}, nil
}

func (h *PodsHandler) replacePublishedPodChildren(
	ctx context.Context,
	q *database.Queries,
	req normalizedPublishPodRequest,
) *requestError {
	for _, deleteFn := range []func(context.Context, uuid.UUID) error{
		q.DeletePublishedPodChildren,
		q.DeletePublishedPodCreators,
		q.DeletePublishedPodAudience,
		q.DeletePublishedPodVMs,
	} {
		if err := deleteFn(ctx, req.ID); err != nil {
			return &requestError{
				Status:      http.StatusInternalServerError,
				UserMessage: "failed to replace published pod details",
				Operation:   "delete published pod children",
				Err:         err,
			}
		}
	}

	for index, principalID := range req.CreatorIDs {
		if err := q.InsertPublishedPodCreator(ctx, database.InsertPublishedPodCreatorParams{
			PodID:       req.ID,
			PrincipalID: principalID,
			SortOrder:   int32(index),
		}); err != nil {
			return childInsertError("insert published pod creator", err)
		}
	}
	for index, principalID := range req.AudienceIDs {
		if err := q.InsertPublishedPodAudience(ctx, database.InsertPublishedPodAudienceParams{
			PodID:       req.ID,
			PrincipalID: principalID,
			SortOrder:   int32(index),
		}); err != nil {
			return childInsertError("insert published pod audience", err)
		}
	}
	for index, vm := range req.VirtualMachines {
		if err := q.InsertPublishedPodVM(ctx, database.InsertPublishedPodVMParams{
			ID:                    uuid.New(),
			PodID:                 req.ID,
			SourceInventoryItemID: vm.SourceInventoryItemID,
			Name:                  vm.Name,
			CpuCount:              vm.CPUCount,
			MemoryMb:              vm.MemoryGB * 1024,
			DiskGb:                float64(vm.StorageGB),
			AllowMask:             vm.AllowMask,
			DenyMask:              vm.DenyMask,
			SortOrder:             int32(index),
		}); err != nil {
			return childInsertError("insert published pod vm", err)
		}
	}
	for taskIndex, task := range req.Tasks {
		taskID, err := q.InsertPublishedPodTask(ctx, database.InsertPublishedPodTaskParams{
			ID:        task.ID,
			PodID:     req.ID,
			Title:     task.Title,
			Content:   task.Content,
			SortOrder: int32(taskIndex),
		})
		if err != nil {
			return childInsertError("insert published pod task", err)
		}
		for questionIndex, question := range task.Questions {
			if err := q.InsertPublishedPodTaskQuestion(ctx, database.InsertPublishedPodTaskQuestionParams{
				ID:            question.ID,
				TaskID:        taskID,
				Title:         question.Title,
				AnswerOutline: question.AnswerOutline,
				Description:   question.Description,
				Hint:          question.Hint,
				SortOrder:     int32(questionIndex),
			}); err != nil {
				return childInsertError("insert published pod task question", err)
			}
		}
	}

	return nil
}

func (h *PodsHandler) uniquePublishedPodSlug(
	ctx context.Context,
	q *database.Queries,
	title string,
	podID uuid.UUID,
) (string, error) {
	base := slugify(title)
	slug := base
	for suffix := 2; ; suffix++ {
		_, err := q.GetPublishedPodSlugConflict(ctx, database.GetPublishedPodSlugConflictParams{
			Slug: slug,
			ID:   podID,
		})
		if errors.Is(err, pgx.ErrNoRows) {
			return slug, nil
		}
		if err != nil {
			return "", err
		}
		slug = fmt.Sprintf("%s-%d", base, suffix)
	}
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

func normalizePrincipalRequests(
	ctx context.Context,
	q *database.Queries,
	principals []publishPodPrincipalRequest,
	minCount int,
	maxCount int,
	label string,
) ([]uuid.UUID, *requestError) {
	if len(principals) < minCount {
		return nil, invalidPublishPod(fmt.Sprintf("add at least %d %s", minCount, label))
	}
	if len(principals) > maxCount {
		return nil, invalidPublishPod(fmt.Sprintf("too many %s principals", label))
	}

	seen := make(map[uuid.UUID]struct{}, len(principals))
	ids := make([]uuid.UUID, 0, len(principals))
	for _, principal := range principals {
		principalID, err := uuid.Parse(principal.ID)
		if err != nil {
			return nil, invalidPublishPod("invalid principal id")
		}
		if _, ok := seen[principalID]; ok {
			continue
		}
		row, err := q.GetPrincipalByID(ctx, principalID)
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, invalidPublishPod("principal not found")
		}
		if err != nil {
			return nil, &requestError{
				Status:      http.StatusInternalServerError,
				UserMessage: "failed to validate principals",
				Operation:   "validate published pod principal",
				Err:         err,
			}
		}
		if principal.Type != "" && principal.Type != string(row.PrincipalType) {
			return nil, invalidPublishPod("principal type does not match")
		}
		seen[principalID] = struct{}{}
		ids = append(ids, principalID)
	}
	if len(ids) < minCount {
		return nil, invalidPublishPod(fmt.Sprintf("add at least %d %s", minCount, label))
	}

	return ids, nil
}

func normalizePublishPodVMs(
	requestVMs []publishPodVMRequest,
	sourceVMs []publishSourceVMOption,
) ([]normalizedPublishPodVM, *requestError) {
	if len(requestVMs) == 0 {
		return nil, invalidPublishPod("select a source folder with at least one VM")
	}
	if len(requestVMs) != len(sourceVMs) {
		return nil, invalidPublishPod("published VMs must match the selected source folder")
	}

	sourceByID := make(map[uuid.UUID]publishSourceVMOption, len(sourceVMs))
	sourceByName := make(map[string]publishSourceVMOption, len(sourceVMs))
	for _, vm := range sourceVMs {
		sourceByID[vm.ID] = vm
		sourceByName[strings.ToLower(vm.Name)] = vm
	}

	seen := make(map[uuid.UUID]struct{}, len(requestVMs))
	vms := make([]normalizedPublishPodVM, 0, len(requestVMs))
	for _, vm := range requestVMs {
		vmID, err := uuid.Parse(vm.ID)
		if err != nil {
			return nil, invalidPublishPod("invalid VM id")
		}
		source, ok := sourceByID[vmID]
		if !ok {
			source, ok = sourceByName[strings.ToLower(strings.TrimSpace(vm.Name))]
		}
		if !ok {
			return nil, invalidPublishPod("VM is not available in the selected source folder")
		}
		if _, ok := seen[source.ID]; ok {
			return nil, invalidPublishPod("duplicate VM in publish request")
		}
		if err := validatePublishedPodPermissions(vm.Permissions); err != nil {
			return nil, invalidPublishPod(err.Error())
		}

		seen[source.ID] = struct{}{}
		vms = append(vms, normalizedPublishPodVM{
			RequestInventoryItemID: vmID,
			SourceInventoryItemID:  source.ID,
			Name:                   source.Name,
			CPUCount:               source.CPUCount,
			MemoryGB:               source.MemoryGB,
			StorageGB:              source.StorageGB,
			AllowMask:              vm.Permissions.AllowMask,
			DenyMask:               vm.Permissions.DenyMask,
		})
	}

	return vms, nil
}

func preservePublishedPodSourceTemplates(
	requestVMs []normalizedPublishPodVM,
	existingVMs []database.ListPublishedPodVMsByPodIDsRow,
) ([]normalizedPublishPodVM, *requestError) {
	if len(requestVMs) != len(existingVMs) {
		return nil, invalidPublishPod("published VMs must match the selected source folder")
	}

	existingByID := make(map[uuid.UUID]database.ListPublishedPodVMsByPodIDsRow, len(existingVMs))
	existingByName := make(map[string]database.ListPublishedPodVMsByPodIDsRow, len(existingVMs))
	for _, vm := range existingVMs {
		existingByID[vm.SourceInventoryItemID] = vm
		existingByName[strings.ToLower(vm.Name)] = vm
	}

	seen := make(map[uuid.UUID]struct{}, len(requestVMs))
	preserved := make([]normalizedPublishPodVM, 0, len(requestVMs))
	for _, requestVM := range requestVMs {
		existing, ok := existingByID[requestVM.RequestInventoryItemID]
		if !ok {
			existing, ok = existingByName[strings.ToLower(requestVM.Name)]
		}
		if !ok {
			return nil, invalidPublishPod("published VMs must match the existing source templates")
		}
		if _, ok := seen[existing.SourceInventoryItemID]; ok {
			return nil, invalidPublishPod("duplicate VM in publish request")
		}

		seen[existing.SourceInventoryItemID] = struct{}{}
		preserved = append(preserved, normalizedPublishPodVM{
			RequestInventoryItemID: requestVM.RequestInventoryItemID,
			SourceInventoryItemID:  existing.SourceInventoryItemID,
			Name:                   existing.Name,
			CPUCount:               existing.CpuCount,
			MemoryGB:               memoryMBToGB(&existing.MemoryMb),
			StorageGB:              diskGBToInt(&existing.DiskGb),
			AllowMask:              requestVM.AllowMask,
			DenyMask:               requestVM.DenyMask,
		})
	}

	return preserved, nil
}

func (h *PodsHandler) preparePublishedPodSourceTemplates(
	ctx context.Context,
	principalID uuid.UUID,
	req normalizedPublishPodRequest,
	progress *publishPodProgressReporter,
) ([]normalizedPublishPodVM, *requestError) {
	if req.SourceFolderID == uuid.Nil {
		return nil, invalidPublishPod("select a source folder")
	}
	if len(req.VirtualMachines) == 0 {
		return nil, invalidPublishPod("select a source folder with at least one VM")
	}

	if reqErr := requireInventoryPermissionRequest(
		ctx,
		h.Authz,
		principalID,
		req.SourceFolderID,
		authorization.CreateFolder,
		"authorize published pod source folder creation",
	); reqErr != nil {
		return nil, reqErr
	}

	progress.update(
		publishProgressStepPreparing,
		0,
		"",
		"Creating or finding the Source folder inside the selected Pod folder.",
	)

	sourceTemplateFolderID, err := h.Service.EnsureChildFolder(
		ctx,
		req.SourceFolderID,
		publishedPodSourceFolderName,
	)
	if err != nil {
		return nil, inventoryRequestError(err)
	}
	if reqErr := requireInventoryPermissionRequest(
		ctx,
		h.Authz,
		principalID,
		sourceTemplateFolderID,
		authorization.CreateVM,
		"authorize published pod source template creation",
	); reqErr != nil {
		return nil, reqErr
	}
	if err := h.Service.EnsureFolderHasVMCapacity(ctx, sourceTemplateFolderID, int32(len(req.VirtualMachines))); err != nil {
		return nil, inventoryRequestError(err)
	}

	placement, err := h.Service.ResolveFolderPlacement(ctx, sourceTemplateFolderID)
	if err != nil {
		return nil, inventoryRequestError(err)
	}

	targetNode, err := h.resolveCloneTargetNode(ctx)
	if err != nil {
		return nil, &requestError{
			Status:      http.StatusBadGateway,
			UserMessage: "failed to resolve target node",
			Operation:   "resolve published pod source clone target node",
			Err:         err,
		}
	}

	clones := make([]publishedSourceClone, 0, len(req.VirtualMachines))
	for vmIndex, vm := range req.VirtualMachines {
		progress.update(
			publishProgressStepCloning,
			vmIndex,
			vm.Name,
			fmt.Sprintf("Full cloning %s into the Source folder.", vm.Name),
		)

		clone, reqErr := h.clonePublishedSourceVM(
			ctx,
			principalID,
			placement,
			targetNode,
			vm,
			progress,
			vmIndex,
		)
		if reqErr != nil {
			return nil, reqErr
		}
		clones = append(clones, clone)

		progress.update(
			publishProgressStepCloning,
			vmIndex+1,
			vm.Name,
			fmt.Sprintf("Finished full cloning %s.", vm.Name),
		)
	}

	prepared := make([]normalizedPublishPodVM, 0, len(clones))
	for cloneIndex, clone := range clones {
		progress.update(
			publishProgressStepTemplating,
			cloneIndex,
			clone.VM.Name,
			fmt.Sprintf("Converting %s into a template.", clone.VM.Name),
		)

		if reqErr := h.convertPublishedSourceCloneToTemplate(ctx, clone, progress, cloneIndex); reqErr != nil {
			return nil, reqErr
		}

		vm := clone.VM
		vm.SourceInventoryItemID = clone.InventoryItemID
		prepared = append(prepared, vm)

		progress.update(
			publishProgressStepTemplating,
			cloneIndex+1,
			clone.VM.Name,
			fmt.Sprintf("Finished converting %s into a template.", clone.VM.Name),
		)
	}

	return prepared, nil
}

type publishedSourceClone struct {
	VM              normalizedPublishPodVM
	InventoryItemID uuid.UUID
	TargetNode      string
	VMID            int
}

func (h *PodsHandler) clonePublishedSourceVM(
	ctx context.Context,
	principalID uuid.UUID,
	placement inventory.FolderPlacement,
	targetNode string,
	vm normalizedPublishPodVM,
	progress *publishPodProgressReporter,
	completedBeforeClone int,
) (publishedSourceClone, *requestError) {
	source, reqErr := resolveVerifiedVMItemPermission(
		ctx,
		h.Authz,
		h.PX,
		principalID,
		vm.SourceInventoryItemID,
		authorization.CloneVM,
		true,
	)
	if reqErr != nil {
		return publishedSourceClone{}, reqErr
	}

	newID, err := h.PX.GetNextVMID(ctx)
	if err != nil {
		return publishedSourceClone{}, &requestError{
			Status:      http.StatusBadGateway,
			UserMessage: "failed to fetch next VMID",
			Operation:   "fetch published pod source clone vmid",
			Err:         err,
		}
	}

	if err := h.PX.CloneVMWithProgress(
		ctx,
		source.Node,
		source.VMID,
		newID,
		vm.Name,
		true,
		targetNode,
		func(task proxmox.TaskProgress) {
			if task.Status != "running" {
				return
			}
			progress.update(
				publishProgressStepCloning,
				completedBeforeClone,
				vm.Name,
				fmt.Sprintf("Proxmox is full cloning %s (%s elapsed).", vm.Name, formatTaskElapsed(task.Elapsed)),
			)
		},
	); err != nil {
		return publishedSourceClone{}, &requestError{
			Status:      http.StatusBadGateway,
			UserMessage: "failed to clone source VM",
			Operation:   "clone published pod source VM",
			Err:         err,
		}
	}
	if err := h.PX.SetVMUpstreamUUID(ctx, targetNode, newID, uuid.New()); err != nil {
		return publishedSourceClone{}, &requestError{
			Status:      http.StatusBadGateway,
			UserMessage: "failed to assign source clone identity",
			Operation:   "assign published pod source clone identity",
			Err:         err,
		}
	}
	if err := h.PX.SyncVMPoolMembership(ctx, targetNode, newID, placement.PoolID, placement.Path); err != nil {
		return publishedSourceClone{}, &requestError{
			Status:      http.StatusBadGateway,
			UserMessage: "failed to sync source clone pool membership",
			Operation:   "sync published pod source clone pool membership",
			Err:         err,
		}
	}

	clonedItemID, err := h.Importer.SyncVM(ctx, placement.FolderID, targetNode, newID)
	if err != nil {
		return publishedSourceClone{}, &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "source VM cloned in Proxmox but failed to sync inventory metadata",
			Operation:   "sync published pod source clone inventory metadata",
			Err:         err,
		}
	}

	return publishedSourceClone{
		VM:              vm,
		InventoryItemID: clonedItemID,
		TargetNode:      targetNode,
		VMID:            newID,
	}, nil
}

func (h *PodsHandler) convertPublishedSourceCloneToTemplate(
	ctx context.Context,
	clone publishedSourceClone,
	progress *publishPodProgressReporter,
	completedBeforeTemplate int,
) *requestError {
	if err := h.PX.ConvertToTemplateWithProgress(
		ctx,
		clone.TargetNode,
		clone.VMID,
		func(task proxmox.TaskProgress) {
			if task.Status != "running" {
				return
			}
			progress.update(
				publishProgressStepTemplating,
				completedBeforeTemplate,
				clone.VM.Name,
				fmt.Sprintf("Proxmox is converting %s into a template (%s elapsed).", clone.VM.Name, formatTaskElapsed(task.Elapsed)),
			)
		},
	); err != nil {
		return &requestError{
			Status:      http.StatusBadGateway,
			UserMessage: "failed to convert source clone to template",
			Operation:   "convert published pod source clone to template",
			Err:         err,
		}
	}

	progress.update(
		publishProgressStepTemplating,
		completedBeforeTemplate,
		clone.VM.Name,
		fmt.Sprintf("Updating template metadata for %s.", clone.VM.Name),
	)

	if err := h.Service.UpdateInventoryVMIsTemplate(ctx, clone.InventoryItemID); err != nil {
		return &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "source clone converted in Proxmox but failed to update inventory metadata",
			Operation:   "update published pod source clone template state",
			Err:         err,
		}
	}

	h.Service.NotifyInventoryChanged(ctx, clone.InventoryItemID)

	return nil
}

func requireInventoryPermissionRequest(
	ctx context.Context,
	authzService *authorization.Service,
	principalID uuid.UUID,
	itemID uuid.UUID,
	required authorization.Mask,
	operation string,
) *requestError {
	err := authzService.Require(ctx, principalID, itemID, required)
	switch {
	case err == nil:
		return nil
	case errors.Is(err, pgx.ErrNoRows):
		return &requestError{
			Status:      http.StatusNotFound,
			UserMessage: "item not found",
		}
	case authorization.IsForbidden(err):
		return &requestError{
			Status:      http.StatusForbidden,
			UserMessage: "forbidden",
		}
	default:
		return &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "authorization failed",
			Operation:   operation,
			Err:         err,
		}
	}
}

func normalizePublishPodTasks(tasks []publishPodTaskRequest) ([]normalizedPublishPodTask, *requestError) {
	if len(tasks) < 1 {
		return nil, invalidPublishPod("add at least one task")
	}
	if len(tasks) > 20 {
		return nil, invalidPublishPod("you can add up to 20 tasks")
	}

	normalized := make([]normalizedPublishPodTask, 0, len(tasks))
	for _, task := range tasks {
		taskID, err := parseOrNewUUID(task.ID)
		if err != nil {
			return nil, invalidPublishPod("invalid task id")
		}
		title := strings.TrimSpace(task.Title)
		if title == "" || len(title) > 64 {
			return nil, invalidPublishPod("task title must be between 1 and 64 characters")
		}
		content := strings.TrimSpace(task.Content)
		if content == "" || len(content) > publishPodTaskContentMaxLength {
			return nil, invalidPublishPod("task content must be between 1 and 4096 characters")
		}

		questions := make([]normalizedPublishPodQuestion, 0, len(task.Questions))
		for _, question := range task.Questions {
			questionID, err := parseOrNewUUID(question.ID)
			if err != nil {
				return nil, invalidPublishPod("invalid question id")
			}
			questionTitle := strings.TrimSpace(question.Title)
			answer := strings.TrimSpace(question.AnswerOutline)
			if questionTitle == "" || len(questionTitle) > publishPodQuestionTextMaxLength {
				return nil, invalidPublishPod("question must be between 1 and 256 characters")
			}
			if answer == "" || len(answer) > publishPodQuestionTextMaxLength {
				return nil, invalidPublishPod("answer must be between 1 and 256 characters")
			}
			hint := trimOptionalString(question.Hint)
			if hint != nil && len(*hint) > publishPodQuestionTextMaxLength {
				return nil, invalidPublishPod("hint must be at most 256 characters")
			}
			questions = append(questions, normalizedPublishPodQuestion{
				ID:            questionID,
				Title:         questionTitle,
				AnswerOutline: answer,
				Description:   trimOptionalString(question.Description),
				Hint:          hint,
			})
		}

		normalized = append(normalized, normalizedPublishPodTask{
			ID:        taskID,
			Title:     title,
			Content:   content,
			Questions: questions,
		})
	}

	return normalized, nil
}

const (
	publishPodQuestionTextMaxLength = 256
	publishPodTaskContentMaxLength  = 4096
)

func validatePublishedPodPermissions(permissions publishPodPermissionRequest) error {
	if permissions.AllowMask < 0 || permissions.DenyMask < 0 {
		return fmt.Errorf("permission masks must be non-negative")
	}
	if permissions.AllowMask&permissions.DenyMask != 0 {
		return fmt.Errorf("permission masks cannot overlap")
	}
	if permissions.AllowMask|permissions.DenyMask > int64(authorization.FullAccessMask) {
		return fmt.Errorf("permission mask includes unsupported bits")
	}

	return nil
}

func parsePublishedPodStatus(status string) (database.PublishedPodStatus, error) {
	switch database.PublishedPodStatus(strings.TrimSpace(status)) {
	case database.PublishedPodStatusListed:
		return database.PublishedPodStatusListed, nil
	case database.PublishedPodStatusUnlisted:
		return database.PublishedPodStatusUnlisted, nil
	default:
		return "", fmt.Errorf("status must be listed or unlisted")
	}
}

func invalidPublishPod(message string) *requestError {
	return &requestError{
		Status:      http.StatusUnprocessableEntity,
		UserMessage: message,
	}
}

func childInsertError(operation string, err error) *requestError {
	return &requestError{
		Status:      http.StatusInternalServerError,
		UserMessage: "failed to save published pod details",
		Operation:   operation,
		Err:         err,
	}
}

func parseOrNewUUID(value string) (uuid.UUID, error) {
	if strings.TrimSpace(value) == "" {
		return uuid.New(), nil
	}
	return uuid.Parse(value)
}

func trimOptionalString(value *string) *string {
	if value == nil {
		return nil
	}
	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func findSourceFolder(
	folders []publishSourceFolderOption,
	folderID uuid.UUID,
) (publishSourceFolderOption, bool) {
	index := slices.IndexFunc(folders, func(folder publishSourceFolderOption) bool {
		return folder.ID == folderID
	})
	if index < 0 {
		return publishSourceFolderOption{}, false
	}
	return folders[index], true
}

func inventoryPath(
	id uuid.UUID,
	rowsByID map[uuid.UUID]database.GetVisibleInventoryItemsForPrincipalRow,
) string {
	parts := make([]string, 0, 4)
	for currentID := id; currentID != uuid.Nil; {
		row, ok := rowsByID[currentID]
		if !ok {
			break
		}
		parts = append(parts, row.Name)
		if row.ParentID == nil {
			break
		}
		currentID = *row.ParentID
	}
	slices.Reverse(parts)
	return strings.Join(parts, " / ")
}

func isInventoryDescendantOf(
	id uuid.UUID,
	ancestorID uuid.UUID,
	rowsByID map[uuid.UUID]database.GetVisibleInventoryItemsForPrincipalRow,
) bool {
	for currentID := id; currentID != uuid.Nil; {
		row, ok := rowsByID[currentID]
		if !ok || row.ParentID == nil {
			return false
		}
		if *row.ParentID == ancestorID {
			return true
		}
		currentID = *row.ParentID
	}
	return false
}

func slugify(value string) string {
	var builder strings.Builder
	lastWasDash := false
	for _, r := range strings.ToLower(value) {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			builder.WriteRune(r)
			lastWasDash = false
			continue
		}
		if builder.Len() > 0 && !lastWasDash {
			builder.WriteRune('-')
			lastWasDash = true
		}
	}

	slug := strings.Trim(builder.String(), "-")
	if slug == "" {
		return "untitled-pod"
	}
	return slug
}

func maskHas(mask int64, required authorization.Mask) bool {
	return mask&int64(required) == int64(required)
}

func positiveHardwareInt(value *int32) int32 {
	if value == nil || *value < 1 {
		return 1
	}
	return *value
}

func memoryMBToGB(value *int32) int32 {
	if value == nil || *value <= 0 {
		return 1
	}
	return max(1, (*value+1023)/1024)
}

func diskGBToInt(value *float64) int32 {
	if value == nil || *value <= 0 {
		return 1
	}
	return int32(max(1, int(math.Ceil(*value))))
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
	return publishedPrincipal(row.ID, row.PrincipalType, row.ExternalID, row.Name, row.Description)
}

func publishedPrincipalFromAudience(row database.ListPublishedPodAudienceByPodIDsRow) publishedPodPrincipalResponse {
	return publishedPrincipal(row.ID, row.PrincipalType, row.ExternalID, row.Name, row.Description)
}

func publishedPrincipal(
	id uuid.UUID,
	principalType database.PrincipalType,
	externalID string,
	name *string,
	description *string,
) publishedPodPrincipalResponse {
	label := externalID
	if name != nil && strings.TrimSpace(*name) != "" {
		label = *name
	}
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

func (h *PodsHandler) buildCloneSpecs(req createPodRequest) ([]podCloneSpec, error) {
	specs := make([]podCloneSpec, 0)

	if req.IncludeRouter {
		if h.RouterTemplateItemID == uuid.Nil {
			return nil, fmt.Errorf("router template is not configured")
		}
		specs = append(specs, podCloneSpec{
			TemplateItemID: h.RouterTemplateItemID,
			Name:           "router",
		})
	}

	for _, template := range req.Templates {
		templateID, err := uuid.Parse(template.TemplateItemID)
		if err != nil {
			return nil, fmt.Errorf("invalid template_item_id")
		}

		for _, vm := range template.VMs {
			name := names.Normalize(vm.Name)
			if err := names.ValidateVM(name); err != nil {
				return nil, err
			}
			if vm.CPUCount < 1 || vm.CPUCount > 8 {
				return nil, fmt.Errorf("CPU must be between 1 and 8 vCPU")
			}
			if vm.MemoryGB < 1 || vm.MemoryGB > 32 {
				return nil, fmt.Errorf("memory must be between 1 and 32 GB")
			}
			if vm.StorageGB < 10 || vm.StorageGB > 100 {
				return nil, fmt.Errorf("storage must be between 10 and 100 GB")
			}

			specs = append(specs, podCloneSpec{
				TemplateItemID: templateID,
				Name:           name,
				Hardware: &podCloneHardware{
					CPUCount:  vm.CPUCount,
					MemoryGB:  vm.MemoryGB,
					StorageGB: vm.StorageGB,
				},
			})
		}
	}

	return specs, nil
}

func (h *PodsHandler) cloneTemplateIntoPod(
	ctx context.Context,
	principalID uuid.UUID,
	podFolderID uuid.UUID,
	spec podCloneSpec,
) (createPodVMResponse, *requestError) {
	source, reqErr := resolveVerifiedVMItemPermission(
		ctx,
		h.Authz,
		h.PX,
		principalID,
		spec.TemplateItemID,
		authorization.CloneVM,
		true,
	)
	if reqErr != nil {
		return createPodVMResponse{}, reqErr
	}

	item, err := h.Service.GetInventoryItemByID(ctx, spec.TemplateItemID)
	switch {
	case err == nil:
	case errors.Is(err, pgx.ErrNoRows):
		return createPodVMResponse{}, &requestError{Status: http.StatusNotFound, UserMessage: "template not found"}
	default:
		return createPodVMResponse{}, &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "failed to load template",
			Operation:   "load pod template inventory item",
			Err:         err,
		}
	}
	if item.IsTemplate == nil || !*item.IsTemplate {
		return createPodVMResponse{}, &requestError{
			Status:      http.StatusUnprocessableEntity,
			UserMessage: "selected VM is not a template",
		}
	}

	placement, err := h.Service.ResolveFolderPlacement(ctx, podFolderID)
	if err != nil {
		return createPodVMResponse{}, inventoryRequestError(err)
	}

	targetNode, err := h.resolveCloneTargetNode(ctx)
	if err != nil {
		return createPodVMResponse{}, &requestError{
			Status:      http.StatusBadGateway,
			UserMessage: "failed to resolve target node",
			Operation:   "resolve pod clone target node",
			Err:         err,
		}
	}

	newID, err := h.PX.GetNextVMID(ctx)
	if err != nil {
		return createPodVMResponse{}, &requestError{
			Status:      http.StatusBadGateway,
			UserMessage: "failed to fetch next VMID",
			Operation:   "fetch pod clone vmid",
			Err:         err,
		}
	}

	if err := h.PX.CloneVM(ctx, source.Node, source.VMID, newID, spec.Name, false, targetNode); err != nil {
		return createPodVMResponse{}, &requestError{
			Status:      http.StatusBadGateway,
			UserMessage: "failed to clone VM",
			Operation:   "clone pod template",
			Err:         err,
		}
	}

	if err := h.PX.SetVMUpstreamUUID(ctx, targetNode, newID, uuid.New()); err != nil {
		return createPodVMResponse{}, &requestError{
			Status:      http.StatusBadGateway,
			UserMessage: "failed to assign clone identity",
			Operation:   "assign pod clone identity",
			Err:         err,
		}
	}

	if err := h.PX.SyncVMPoolMembership(ctx, targetNode, newID, placement.PoolID, placement.Path); err != nil {
		return createPodVMResponse{}, &requestError{
			Status:      http.StatusBadGateway,
			UserMessage: "failed to sync VM pool membership",
			Operation:   "sync pod clone pool membership",
			Err:         err,
		}
	}

	clonedItemID, err := h.Importer.SyncVM(ctx, placement.FolderID, targetNode, newID)
	if err != nil {
		return createPodVMResponse{}, &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "vm cloned in Proxmox but failed to sync inventory metadata",
			Operation:   "sync pod clone inventory metadata",
			Err:         err,
		}
	}

	if spec.Hardware != nil {
		if err := h.applyCloneHardware(ctx, targetNode, newID, clonedItemID, *spec.Hardware); err != nil {
			return createPodVMResponse{}, &requestError{
				Status:      http.StatusUnprocessableEntity,
				UserMessage: err.Error(),
				Operation:   "apply pod clone hardware",
				Err:         err,
			}
		}
	}

	h.Service.NotifyInventoryChanged(ctx, clonedItemID)

	clonedItem, err := h.Service.GetInventoryItemWithPermissions(ctx, principalID, clonedItemID)
	if err != nil {
		return createPodVMResponse{}, &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "vm cloned in Proxmox but failed to load inventory item",
			Operation:   "load pod clone inventory item",
			Err:         err,
		}
	}

	return createPodVMResponse{
		TemplateItemID: spec.TemplateItemID,
		VMID:           newID,
		ItemID:         clonedItemID,
		Item:           buildInventoryItem(clonedItem),
	}, nil
}

func (h *PodsHandler) resolveCloneTargetNode(ctx context.Context) (string, error) {
	optimalNode, err := h.PX.GetOptimalNode(ctx)
	if err != nil {
		return "", err
	}

	return strings.TrimSpace(optimalNode.Node), nil
}

func (h *PodsHandler) applyCloneHardware(
	ctx context.Context,
	node string,
	vmid int,
	itemID uuid.UUID,
	hardware podCloneHardware,
) error {
	config, err := h.PX.GetVMHardwareConfig(ctx, node, vmid)
	if err != nil {
		return fmt.Errorf("failed to load cloned VM hardware")
	}

	config.Sockets = 1
	config.Cores = hardware.CPUCount
	config.Memory = hardware.MemoryGB
	if config.Balloon > config.Memory {
		config.Balloon = config.Memory
	}
	if hardware.StorageGB > config.DiskSize {
		config.DiskSize = hardware.StorageGB
	}

	if err := h.PX.UpdateVMHardware(ctx, node, vmid, *config); err != nil {
		return err
	}

	return h.Service.UpdateInventoryVMHardwareSummary(
		ctx,
		itemID,
		int32(config.Sockets*config.Cores),
		int32(config.Memory*1024),
		float64(config.DiskSize),
	)
}

func formatTaskElapsed(elapsed time.Duration) string {
	seconds := int(elapsed.Round(time.Second) / time.Second)
	if seconds < 1 {
		return "0s"
	}
	minutes := seconds / 60
	remainingSeconds := seconds % 60
	if minutes == 0 {
		return fmt.Sprintf("%ds", remainingSeconds)
	}
	return fmt.Sprintf("%dm %02ds", minutes, remainingSeconds)
}

func inventoryRequestError(err error) *requestError {
	status := http.StatusInternalServerError
	message := "inventory mutation failed"

	switch {
	case errors.Is(err, inventory.ErrInventoryItemNotFound),
		errors.Is(err, inventory.ErrInventoryFolderNotFound),
		errors.Is(err, inventory.ErrInventoryParentNotFound):
		status = http.StatusNotFound
		message = err.Error()
	case errors.Is(err, inventory.ErrInventoryTargetNotFolder),
		errors.Is(err, inventory.ErrInventoryItemNotFolder),
		errors.Is(err, inventory.ErrInventoryFolderDepthExceeded),
		errors.Is(err, inventory.ErrInventoryInvalidFolderLimit),
		errors.Is(err, names.ErrRequired),
		errors.Is(err, names.ErrTooLong),
		errors.Is(err, names.ErrMustStartWithLetter),
		errors.Is(err, names.ErrInvalidCharacters):
		status = http.StatusUnprocessableEntity
		message = err.Error()
	case errors.Is(err, inventory.ErrInventoryInvalidMove),
		errors.Is(err, inventory.ErrInventoryReservedFolder),
		errors.Is(err, inventory.ErrInventoryFolderConflict),
		errors.Is(err, inventory.ErrInventoryFolderLimitExceeded):
		status = http.StatusConflict
		message = err.Error()
	}

	return &requestError{
		Status:      status,
		UserMessage: message,
	}
}
