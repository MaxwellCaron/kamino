package handlers

import (
	"context"
	"errors"
	"fmt"
	"log"
	"math"
	"net/http"
	"net/netip"
	"net/url"
	"slices"
	"sort"
	"strings"
	"sync"
	"time"
	"unicode"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/audit"
	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/MaxwellCaron/kamino/internal/inventory"
	"github.com/MaxwellCaron/kamino/internal/names"
	"github.com/MaxwellCaron/kamino/internal/principals"
	"github.com/MaxwellCaron/kamino/internal/proxmox"
	"github.com/MaxwellCaron/kamino/internal/proxmox/vmstatus"
	"github.com/MaxwellCaron/kamino/internal/vmactions"
	"github.com/MaxwellCaron/kamino/internal/vmidalloc"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/sync/errgroup"
)

const (
	podsFolderName                 = "Pods"
	templatesFolderName            = "Templates"
	podVirtualMachinesFolderName   = "a0-Virtual-Machines"
	publishedPodTemplateFolderName = "a1-Templates"

	// publishCloneConcurrency bounds how many Pod VMs are cloned at once.
	publishCloneConcurrency = 2
)

type PodRouterCloneConfig struct {
	VNetPrefix                       string
	NetworkMin                       int32
	NetworkMax                       int32
	DevNetworkMin                    int32
	DevNetworkMax                    int32
	RouterWaitTimeout                time.Duration
	WANIPBase                        string
	InternalSubnet                   netip.Prefix
	CloudInitStorage                 string
	CloudInitUserFilePattern         string
	CloudInitNetworkFile             string
	PersonalVNetPrefix               string
	PersonalNetworkMin               int32
	PersonalNetworkMax               int32
	PersonalWANIPBase                string
	PersonalCloudInitUserFilePattern string
}

type PodsHandler struct {
	PX                              *proxmox.Client
	Importer                        *proxmox.InventoryImporter
	Service                         *inventory.Service
	Authz                           *authorization.Service
	DB                              *pgxpool.Pool
	Notifier                        *vmstatus.Notifier
	Actions                         *vmactions.Executor
	RouterTemplateItemID            uuid.UUID
	PersonalPodRouterTemplateItemID uuid.UUID
	RouterCloneConfig               PodRouterCloneConfig
	Audit                           *audit.Service
	TemplatesFolderItemID           uuid.UUID
	PodsFolderItemID                uuid.UUID
	PersonalPodsFolderItemID        uuid.UUID
	Allocator                       *vmidalloc.Allocator
	PublishVMIDRange                vmidalloc.Range
	CloneVMIDRange                  vmidalloc.Range
	DevVMIDRange                    vmidalloc.Range
	PersonalVMIDRange               vmidalloc.Range
}

var errConfiguredPodsFolderMissing = errors.New("configured PODS_FOLDER_ITEM_ID does not resolve to an existing folder")
var errConfiguredPersonalPodsFolderMissing = errors.New("configured PERSONAL_PODS_FOLDER_ITEM_ID does not resolve to an existing folder")

// resolveTemplatesFolderID prefers the configured TEMPLATES_FOLDER_ITEM_ID and
// falls back to matching the "Templates" folder by name under the root.
func (h *PodsHandler) resolveTemplatesFolderID(ctx context.Context) (uuid.UUID, bool, error) {
	return h.resolveConfiguredFolderID(ctx, h.TemplatesFolderItemID, templatesFolderName)
}

func (h *PodsHandler) resolvePodsFolderID(ctx context.Context) (uuid.UUID, bool, error) {
	return h.resolveConfiguredFolderID(ctx, h.PodsFolderItemID, podsFolderName)
}

func (h *PodsHandler) resolvePersonalPodsFolderID(ctx context.Context) (uuid.UUID, bool, error) {
	return h.resolveConfiguredFolderID(ctx, h.PersonalPodsFolderItemID, personalPodsFolderName)
}

func (h *PodsHandler) resolveConfiguredFolderID(
	ctx context.Context,
	configuredID uuid.UUID,
	fallbackName string,
) (uuid.UUID, bool, error) {
	if configuredID == uuid.Nil {
		return h.Service.FindFolderPath(ctx, []string{fallbackName})
	}

	item, err := h.Service.GetInventoryItemByID(ctx, configuredID)
	if errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, false, nil
	}
	if err != nil {
		return uuid.Nil, false, err
	}
	if item.Kind != database.InventoryItemKindFolder {
		return uuid.Nil, false, nil
	}
	return item.ID, true, nil
}

// ensurePodsFolderID is used by pod creation, which must end up with a
// concrete Pods folder. With a configured ID the folder must already exist.
func (h *PodsHandler) ensurePodsFolderID(ctx context.Context) (uuid.UUID, error) {
	if h.PodsFolderItemID == uuid.Nil {
		return h.Service.EnsureFolderPathWithDescription(ctx, []string{podsFolderName}, new(inventory.PurposePodsFolderDescription))
	}

	id, found, err := h.resolvePodsFolderID(ctx)
	if err != nil {
		return uuid.Nil, err
	}
	if !found {
		return uuid.Nil, errConfiguredPodsFolderMissing
	}
	if err := h.Service.SetFolderDescription(ctx, id, inventory.PurposePodsFolderDescription); err != nil {
		return uuid.Nil, err
	}
	return id, nil
}

func (h *PodsHandler) ensurePersonalPodsFolderID(ctx context.Context) (uuid.UUID, error) {
	if h.PersonalPodsFolderItemID == uuid.Nil {
		return h.Service.EnsureFolderPathWithDescription(ctx, []string{personalPodsFolderName}, new(inventory.PurposePersonalPodsFolderDescription))
	}

	id, found, err := h.resolvePersonalPodsFolderID(ctx)
	if err != nil {
		return uuid.Nil, err
	}
	if !found {
		return uuid.Nil, errConfiguredPersonalPodsFolderMissing
	}
	if err := h.Service.SetFolderDescription(ctx, id, inventory.PurposePersonalPodsFolderDescription); err != nil {
		return uuid.Nil, err
	}
	return id, nil
}

func (h *PodsHandler) EnsurePurposeFolderDescriptions(ctx context.Context) error {
	syncDescription := func(label string, sync func() error) {
		if err := sync(); err != nil {
			log.Printf("Purpose folder description sync for %q failed: %v", label, err)
		}
	}

	rows, err := database.New(h.DB).GetAllInventoryItems(ctx)
	if err != nil {
		return err
	}
	if rootID := proxmox.FindManagedRootFolderID(rows); rootID != nil {
		syncDescription(proxmox.RootFolderName, func() error {
			return h.Service.SetFolderDescription(ctx, *rootID, inventory.PurposeProxmoxRootFolderDescription)
		})
	}

	syncDescription(podsFolderName, func() error {
		if h.PodsFolderItemID != uuid.Nil {
			id, found, err := h.resolvePodsFolderID(ctx)
			if err != nil || !found {
				return err
			}
			return h.Service.SetFolderDescription(ctx, id, inventory.PurposePodsFolderDescription)
		}
		id, found, err := h.Service.FindFolderPath(ctx, []string{podsFolderName})
		if err != nil || !found {
			return err
		}
		return h.Service.SetFolderDescription(ctx, id, inventory.PurposePodsFolderDescription)
	})

	syncDescription(personalPodsFolderName, func() error {
		if h.PersonalPodsFolderItemID != uuid.Nil {
			id, found, err := h.resolvePersonalPodsFolderID(ctx)
			if err != nil || !found {
				return err
			}
			return h.Service.SetFolderDescription(ctx, id, inventory.PurposePersonalPodsFolderDescription)
		}
		id, found, err := h.Service.FindFolderPath(ctx, []string{personalPodsFolderName})
		if err != nil || !found {
			return err
		}
		return h.Service.SetFolderDescription(ctx, id, inventory.PurposePersonalPodsFolderDescription)
	})

	syncDescription(templatesFolderName, func() error {
		id, found, err := h.resolveTemplatesFolderID(ctx)
		if err != nil || !found {
			return err
		}
		return h.Service.SetFolderDescription(ctx, id, inventory.PurposeTemplatesFolderDescription)
	})

	return nil
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

type publishPodVMOption struct {
	ID          uuid.UUID                      `json:"id"`
	Name        string                         `json:"name"`
	CPUCount    int32                          `json:"cpuCount"`
	MemoryGB    int32                          `json:"memoryGb"`
	StorageGB   int32                          `json:"storageGb"`
	Permissions publishedPodPermissionResponse `json:"permissions"`
}

type publishPodFolderOption struct {
	ID              uuid.UUID            `json:"id"`
	Name            string               `json:"name"`
	Path            string               `json:"path"`
	VirtualMachines []publishPodVMOption `json:"virtual_machines"`
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
	ID                    string                       `json:"id"`
	Title                 string                       `json:"title"`
	Description           string                       `json:"description"`
	Image                 string                       `json:"image"`
	Creators              []publishPodPrincipalRequest `json:"creators"`
	Status                string                       `json:"status"`
	Audience              []publishPodPrincipalRequest `json:"audience"`
	SourceFolder          string                       `json:"source_folder"`
	VirtualMachines       []publishPodVMRequest        `json:"virtual_machines"`
	UpdateVirtualMachines []string                     `json:"update_virtual_machines"`
	Tasks                 []publishPodTaskRequest      `json:"tasks"`
}

type updatePublishedPodStatusRequest struct {
	Status string `json:"status" binding:"required"`
}

type publishedPodCloneOwnerResponse struct {
	ID          uuid.UUID `json:"id"`
	Type        string    `json:"type"`
	Label       string    `json:"label"`
	Description string    `json:"description"`
}

type publishedPodCloneTaskSummaryResponse struct {
	Total     int32   `json:"total"`
	Completed int32   `json:"completed"`
	Progress  float64 `json:"progress"`
}

type clonedPodNetworkResponse struct {
	Number          int32  `json:"number"`
	VNet            string `json:"vnet"`
	ExternalSubnet  string `json:"external_subnet"`
	ExternalGateway string `json:"external_gateway"`
	InternalSubnet  string `json:"internal_subnet"`
	InternalGateway string `json:"internal_gateway"`
}

type publishedPodCloneResponse struct {
	ID          uuid.UUID                            `json:"id"`
	PodID       uuid.UUID                            `json:"pod_id"`
	Owner       publishedPodCloneOwnerResponse       `json:"owner"`
	ClonedAt    time.Time                            `json:"cloned_at"`
	UpdatedAt   time.Time                            `json:"updated_at"`
	Status      string                               `json:"status"`
	Network     clonedPodNetworkResponse             `json:"network"`
	VMCount     int32                                `json:"vm_count"`
	TaskSummary publishedPodCloneTaskSummaryResponse `json:"task_summary"`
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

	publishedPodID := uuid.Nil
	if value := strings.TrimSpace(c.Query("published_pod_id")); value != "" {
		parsed, err := uuid.Parse(value)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid published pod id"})
			return
		}
		publishedPodID = parsed
	}

	podFolders, err := h.publishPodFolders(c.Request.Context(), principalID, publishedPodID)
	if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to load Pod Folders", "load publish Pod Folders", err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"source_folders": podFolders})
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

func (h *PodsHandler) GetCreateProgress(c *gin.Context) {
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

	snapshot, ok := createPodProgress.get(progressID)
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

	progress := newPublishPodProgressReporter(c.Query("progress_id"))
	progress.set(publishProgressStepValidating, "Checking the selected Pod Folder and Pod VMs.")

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
	h.Audit.RecordSuccess(c.Request.Context(), audit.EventParams{
		ActorPrincipalID: &principalID,
		ActionKind:       "pod.publish.save",
		TargetKind:       "pod",
		PodID:            &pod.ID,
		Metadata:         map[string]any{"is_update": pathID != uuid.Nil},
	})
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

	h.Audit.RecordSuccess(c.Request.Context(), audit.EventParams{
		ActorPrincipalID: &principalID,
		ActionKind:       "pod.publish.status_update",
		TargetKind:       "pod",
		PodID:            &podID,
		Metadata:         map[string]any{"status": req.Status},
	})
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

	h.Audit.RecordSuccess(c.Request.Context(), audit.EventParams{
		ActorPrincipalID: &principalID,
		ActionKind:       "pod.publish.delete",
		TargetKind:       "pod",
		PodID:            &podID,
	})
	c.Status(http.StatusNoContent)
}

func (h *PodsHandler) ListPublishedPodClones(c *gin.Context) {
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

	vmRows, err := q.ListClonedPodRuntimeVMsByCloneIDs(ctx, cloneIDs)
	if err != nil {
		return nil, err
	}

	allVMIDs := make([]int, 0, len(vmRows))
	vmsByClone := make(map[uuid.UUID][]database.ListClonedPodRuntimeVMsByCloneIDsRow, len(cloneIDs))
	for _, row := range vmRows {
		vmsByClone[row.ClonedPodID] = append(vmsByClone[row.ClonedPodID], row)
		if row.Vmid != nil {
			allVMIDs = append(allVMIDs, int(*row.Vmid))
		}
	}

	statuses, _, err := h.runtimeForVMIDs(ctx, allVMIDs)
	if err != nil {
		return nil, err
	}

	response := make([]publishedPodCloneResponse, 0, len(summaries))
	for _, s := range summaries {
		vmStatusList := make([]string, 0, len(vmsByClone[s.ID]))
		for _, row := range vmsByClone[s.ID] {
			if row.Vmid == nil {
				vmStatusList = append(vmStatusList, "missing")
				continue
			}
			st, ok := statuses[int(*row.Vmid)]
			if !ok {
				vmStatusList = append(vmStatusList, "missing")
				continue
			}
			vmStatusList = append(vmStatusList, st)
		}
		if len(vmStatusList) == 0 {
			vmStatusList = []string{"missing"}
		}

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
			Status:    clonedPodRuntimeStatus(vmStatusList),
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

type createPodVMResult struct {
	response createPodVMResponse
	target   podNetworkVMTarget
}

type createPodResponse struct {
	OK       bool                  `json:"ok"`
	FolderID uuid.UUID             `json:"folder_id"`
	VMs      []createPodVMResponse `json:"vms"`
}

type podCloneSpec struct {
	TemplateItemID uuid.UUID
	Name           string
	Router         bool
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

	templatesFolderID, found, err := h.resolveTemplatesFolderID(c.Request.Context())
	if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to load templates", "find pod template folder", err)
		return
	}
	if !found {
		c.JSON(http.StatusOK, podCreateOptionsResponse{
			RouterTemplateConfigured: h.RouterTemplateItemID != uuid.Nil,
			Templates:                []podTemplateOption{},
		})
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
		if row.ParentID == nil || *row.ParentID != templatesFolderID {
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

	podsFolderID, found, err := h.resolvePodsFolderID(c.Request.Context())
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

	progress := newCreatePodProgressReporter(c.Query("progress_id"))
	progress.set(createProgressStepValidating, "Checking Pod name and selected templates.")

	var req createPodRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		progress.fail("invalid request body")
		writeInvalidRequest(c, "invalid request body")
		return
	}

	req.Name = names.Normalize(req.Name)
	if err := names.ValidateFolder(req.Name); err != nil {
		progress.fail(err.Error())
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": err.Error()})
		return
	}

	specs, err := h.buildCloneSpecs(req)
	if err != nil {
		progress.fail(err.Error())
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": err.Error()})
		return
	}

	progress.set(createProgressStepFolders, "Creating Pod inventory folders.")
	podsFolderID, err := h.ensurePodsFolderID(c.Request.Context())
	if err != nil {
		if errors.Is(err, errConfiguredPodsFolderMissing) {
			progress.fail(err.Error())
			c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
			return
		}
		progress.fail(inventoryRequestError(err).UserMessage)
		writeInventoryError(c, err)
		return
	}
	if !requireInventoryPermission(c, h.Authz, principalID, podsFolderID, authorization.CreateFolder) {
		progress.fail("forbidden")
		return
	}
	if len(specs) > 0 && !requireInventoryPermission(c, h.Authz, principalID, podsFolderID, authorization.CreateVM) {
		progress.fail("forbidden")
		return
	}

	podFolderID, err := h.Service.CreateFolder(c.Request.Context(), podsFolderID, req.Name)
	if err != nil {
		progress.fail(inventoryRequestError(err).UserMessage)
		writeInventoryError(c, err)
		return
	}
	if !requireInventoryPermission(c, h.Authz, principalID, podFolderID, authorization.CreateFolder) {
		progress.fail("forbidden")
		h.cleanupFailedPodProvision(podFolderID, nil)
		return
	}

	vmFolderID, err := h.Service.EnsureChildFolderWithDescription(
		c.Request.Context(),
		podFolderID,
		podVirtualMachinesFolderName,
		new(inventory.PurposePodVirtualMachinesFolderDescription),
	)
	if err != nil {
		progress.fail(inventoryRequestError(err).UserMessage)
		h.cleanupFailedPodProvision(podFolderID, nil)
		writeInventoryError(c, err)
		return
	}

	if len(specs) > 0 {
		if !requireInventoryPermission(c, h.Authz, principalID, vmFolderID, authorization.CreateVM) {
			progress.fail("forbidden")
			h.cleanupFailedPodProvision(podFolderID, nil)
			return
		}
		reservation, err := h.Service.ReserveFolderVMCapacity(c.Request.Context(), vmFolderID, int32(len(specs)), "pod_create_vms")
		if err != nil {
			progress.fail(inventoryRequestError(err).UserMessage)
			h.cleanupFailedPodProvision(podFolderID, nil)
			writeInventoryError(c, err)
			return
		}
		if reservation != nil {
			defer reservation.Release(c.Request.Context())
		}
	}

	var devNetworkNumber int32
	if req.IncludeRouter {
		progress.set(createProgressStepNetwork, "Reserving a dev network.")
		allocation, err := database.New(h.DB).InsertPodDevNetworkAllocation(
			c.Request.Context(),
			database.InsertPodDevNetworkAllocationParams{
				PodFolderID:      podFolderID,
				MinNetworkNumber: h.RouterCloneConfig.DevNetworkMin,
				MaxNetworkNumber: h.RouterCloneConfig.DevNetworkMax,
			},
		)
		if errors.Is(err, pgx.ErrNoRows) {
			progress.fail("no pod dev network numbers available")
			h.cleanupFailedPodProvision(podFolderID, nil)
			c.JSON(http.StatusConflict, gin.H{"error": "no pod dev network numbers available"})
			return
		}
		if err != nil {
			progress.fail("failed to reserve pod dev network")
			h.cleanupFailedPodProvision(podFolderID, nil)
			writeLoggedError(c, http.StatusInternalServerError, "failed to reserve pod dev network", "insert pod dev network allocation", err)
			return
		}

		devNetworkNumber = allocation.NetworkNumber
		vnetName := h.podVNetName(devNetworkNumber)
		progress.set(createProgressStepNetwork, fmt.Sprintf("Checking dev VNet %s.", vnetName))
		if reqErr := h.ensurePodVNetExists(c.Request.Context(), vnetName); reqErr != nil {
			progress.fail(reqErr.UserMessage)
			h.cleanupFailedPodProvision(podFolderID, nil)
			writeRequestError(c, reqErr)
			return
		}
	}

	createdVMs := make([]createPodVMResponse, 0, len(specs))
	createdTargets := make([]podNetworkVMTarget, 0, len(specs))
	created := make(map[int]clonedVM, len(specs))
	if len(specs) > 0 {
		devBatch, batchErr := h.Allocator.NewBatch(c.Request.Context(), h.DevVMIDRange, len(specs))
		if batchErr != nil {
			progress.fail("insufficient VMID capacity in the dev range")
			h.cleanupFailedPodProvision(podFolderID, created)
			writeLoggedError(c, http.StatusBadGateway, fmt.Sprintf("insufficient VMID capacity in dev range (%d–%d) for %d VMs", h.DevVMIDRange.Min, h.DevVMIDRange.Max, len(specs)), "allocate dev VMID batch", batchErr)
			return
		}

		placement, err := h.Service.ResolveFolderPlacement(c.Request.Context(), vmFolderID)
		if err != nil {
			progress.fail(inventoryRequestError(err).UserMessage)
			h.cleanupFailedPodProvision(podFolderID, created)
			writeInventoryError(c, err)
			return
		}
		targetNode, err := h.resolveCloneTargetNode(c.Request.Context())
		if err != nil {
			progress.fail("failed to resolve target node")
			h.cleanupFailedPodProvision(podFolderID, created)
			writeLoggedError(c, http.StatusBadGateway, "failed to resolve target node", "resolve pod clone target node", err)
			return
		}

		for _, spec := range specs {
			message := fmt.Sprintf("Cloning %s into the Pod.", spec.Name)
			if spec.Router {
				message = "Cloning router into the Pod."
			}
			progress.set(createProgressStepCloning, message)

			createdVM, reqErr := h.cloneTemplateIntoPod(
				c.Request.Context(),
				principalID,
				placement,
				targetNode,
				spec,
				cloneVMOptions{
					batch: devBatch,
					onStarted: func(node string, vmid int) {
						created[vmid] = clonedVM{
							TargetNode: node,
							VMID:       vmid,
						}
					},
					onSynced: func(clone clonedVM) {
						created[clone.VMID] = clone
					},
				},
			)
			if reqErr != nil {
				progress.fail(reqErr.UserMessage)
				h.cleanupFailedPodProvision(podFolderID, created)
				writeRequestError(c, reqErr)
				return
			}
			createdVMs = append(createdVMs, createdVM.response)
			createdTargets = append(createdTargets, createdVM.target)
		}

		progress.set(createProgressStepWaiting, "Preparing cloned virtual machines.")
		if reqErr := h.waitForPodVMTargetsReady(c.Request.Context(), createdTargets); reqErr != nil {
			progress.fail(reqErr.UserMessage)
			h.cleanupFailedPodProvision(podFolderID, created)
			writeRequestError(c, reqErr)
			return
		}
		if req.IncludeRouter {
			devVNetName := h.podVNetName(devNetworkNumber)
			progress.set(createProgressStepConfiguring, "Configuring dev VNet bridges.")
			if reqErr := h.configurePodVNetBridges(c.Request.Context(), devVNetName, createdTargets); reqErr != nil {
				progress.fail(reqErr.UserMessage)
				h.cleanupFailedPodProvision(podFolderID, created)
				writeRequestError(c, reqErr)
				return
			}

			cloudInitConfig, err := buildClonedRouterCloudInitConfig(devNetworkNumber, h.RouterCloneConfig)
			if err != nil {
				progress.fail("failed to build router cloud-init configuration")
				h.cleanupFailedPodProvision(podFolderID, created)
				writeLoggedError(c, http.StatusInternalServerError, "failed to build router cloud-init configuration", "build cloned router cloud-init configuration", err)
				return
			}

			progress.set(createProgressStepRouter, "Starting router.")
			if reqErr := h.configurePodRouterCloudInit(c.Request.Context(), cloudInitConfig, createdTargets); reqErr != nil {
				progress.fail(reqErr.UserMessage)
				h.cleanupFailedPodProvision(podFolderID, created)
				writeRequestError(c, reqErr)
				return
			}
		}
	}

	progress.succeed("Pod created successfully.")
	h.Audit.RecordSuccess(c.Request.Context(), audit.EventParams{
		ActorPrincipalID: &principalID,
		ActionKind:       "pod.create",
		TargetKind:       "folder",
		InventoryItemID:  &podFolderID,
		Metadata:         map[string]any{"name": req.Name},
	})
	c.JSON(http.StatusOK, createPodResponse{
		OK:       true,
		FolderID: podFolderID,
		VMs:      createdVMs,
	})
}

func (h *PodsHandler) publishPodFolders(
	ctx context.Context,
	principalID uuid.UUID,
	publishedPodID uuid.UUID,
) ([]publishPodFolderOption, error) {
	podsFolderID, found, err := h.resolvePodsFolderID(ctx)
	if err != nil {
		return nil, err
	}
	if !found {
		return []publishPodFolderOption{}, nil
	}

	rows, err := h.Service.GetVisibleInventoryItems(ctx, principalID)
	if err != nil {
		return nil, err
	}

	publishedRows, err := database.New(h.DB).ListPublishedPods(ctx)
	if err != nil {
		return nil, err
	}
	publishedPodFolderIDs := make(map[uuid.UUID]struct{}, len(publishedRows))
	for _, row := range publishedRows {
		if row.ID == publishedPodID {
			continue
		}
		publishedPodFolderIDs[row.SourceFolderID] = struct{}{}
	}

	return buildPublishPodFolderOptions(rows, podsFolderID, publishedPodFolderIDs), nil
}

func buildPublishPodFolderOptions(
	rows []database.GetVisibleInventoryItemsForPrincipalRow,
	podsFolderID uuid.UUID,
	publishedPodFolderIDs map[uuid.UUID]struct{},
) []publishPodFolderOption {
	rowsByID := make(map[uuid.UUID]database.GetVisibleInventoryItemsForPrincipalRow, len(rows))
	for _, row := range rows {
		rowsByID[row.ID] = row
	}

	folders := make(map[uuid.UUID]*publishPodFolderOption, len(rows))
	for _, row := range rows {
		if row.Kind != database.InventoryItemKindFolder {
			continue
		}
		if row.ParentID == nil || *row.ParentID != podsFolderID {
			continue
		}
		if _, published := publishedPodFolderIDs[row.ID]; published {
			continue
		}
		if !maskHas(row.AllowedMask, authorization.View) {
			continue
		}
		folders[row.ID] = &publishPodFolderOption{
			ID:   row.ID,
			Name: row.Name,
			Path: inventoryPath(row.ID, rowsByID),
		}
	}

	vmFolderToPodRoot := make(map[uuid.UUID]uuid.UUID)
	for _, row := range rows {
		if row.Kind != database.InventoryItemKindFolder {
			continue
		}
		if row.Name != podVirtualMachinesFolderName {
			continue
		}
		if row.ParentID == nil {
			continue
		}
		if _, ok := folders[*row.ParentID]; !ok {
			continue
		}
		vmFolderToPodRoot[row.ID] = *row.ParentID
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

		podRootID, ok := vmFolderToPodRoot[*row.ParentID]
		if !ok {
			continue
		}
		folder := folders[podRootID]
		if folder == nil {
			continue
		}
		folder.VirtualMachines = append(folder.VirtualMachines, publishPodVMOption{
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

	options := make([]publishPodFolderOption, 0, len(folders))
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

	return options
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

	replacedTemplateIDs := []uuid.UUID{}
	createdTemplateIDs := []uuid.UUID{}
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
		if len(normalized.UpdateVirtualMachines) == 0 {
			normalized.VirtualMachines, reqErr = preservePublishedPodTemplateRefs(normalized.VirtualMachines, existingVMs)
			if reqErr != nil {
				return publishedPodResponse{}, reqErr
			}
		} else {
			normalized.VirtualMachines, replacedTemplateIDs, reqErr = h.updatePublishedPodTemplates(ctx, principalID, normalized, existingVMs, progress)
			if reqErr != nil {
				return publishedPodResponse{}, reqErr
			}
			createdTemplateIDs = newPublishedPodTemplateIDs(normalized.VirtualMachines, existingVMs)
		}
	} else {
		normalized.VirtualMachines, reqErr = h.preparePublishedPodTemplates(ctx, principalID, normalized, progress)
		if reqErr != nil {
			return publishedPodResponse{}, reqErr
		}
		createdTemplateIDs = publishedPodTemplateIDs(normalized.VirtualMachines)
	}

	progress.set(publishProgressStepSaving, "Writing the published Pod metadata to the catalog.")
	cleanupCreatedTemplates := true
	defer func() {
		if cleanupCreatedTemplates {
			h.cleanupPublishedPodTemplates(createdTemplateIDs)
		}
	}()

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
	}

	if err := h.replacePublishedPodChildren(ctx, q, normalized); err != nil {
		return publishedPodResponse{}, err
	}

	cleanupCreatedTemplates = false
	if err := tx.Commit(ctx); err != nil {
		return publishedPodResponse{}, &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "failed to save published pod",
			Operation:   "commit published pod tx",
			Err:         err,
		}
	}

	if len(replacedTemplateIDs) > 0 {
		progress.set(publishProgressStepSaving, "Deleting replaced Pod Template VMs.")
		if reqErr := h.deletePublishedPodTemplates(ctx, replacedTemplateIDs); reqErr != nil {
			return publishedPodResponse{}, reqErr
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
	ID                    uuid.UUID
	Title                 string
	Description           string
	Image                 string
	Status                database.PublishedPodStatus
	SourceFolderID        uuid.UUID
	CreatorIDs            []uuid.UUID
	AudienceIDs           []uuid.UUID
	VirtualMachines       []normalizedPublishPodVM
	UpdateVirtualMachines []uuid.UUID
	Tasks                 []normalizedPublishPodTask
}

type normalizedPublishPodVM struct {
	PublishedPodVMID       uuid.UUID
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

	podFolderID, err := uuid.Parse(req.SourceFolder)
	if err != nil {
		return normalizedPublishPodRequest{}, invalidPublishPod("select a Pod Folder")
	}
	podFolders, err := h.publishPodFolders(ctx, principalID, podID)
	if err != nil {
		return normalizedPublishPodRequest{}, &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "failed to load Pod Folders",
			Operation:   "load Pod Folders for published pod validation",
			Err:         err,
		}
	}

	podFolder, ok := findPodFolder(podFolders, podFolderID)
	if !ok {
		return normalizedPublishPodRequest{}, invalidPublishPod("Pod Folder is not available")
	}

	principalQ := database.New(h.DB)
	creatorIDs, reqErr := normalizePrincipalRequests(ctx, principalQ, req.Creators, 1, 5, "creator")
	if reqErr != nil {
		return normalizedPublishPodRequest{}, reqErr
	}
	audienceIDs, reqErr := normalizePrincipalRequests(ctx, principalQ, req.Audience, 0, 1<<31-1, "audience")
	if reqErr != nil {
		return normalizedPublishPodRequest{}, reqErr
	}

	vms, reqErr := normalizePublishPodVMs(req.VirtualMachines, podFolder.VirtualMachines)
	if reqErr != nil {
		return normalizedPublishPodRequest{}, reqErr
	}
	updateVMs, reqErr := normalizePublishPodUpdateVMs(req.UpdateVirtualMachines)
	if reqErr != nil {
		return normalizedPublishPodRequest{}, reqErr
	}
	tasks, reqErr := normalizePublishPodTasks(req.Tasks)
	if reqErr != nil {
		return normalizedPublishPodRequest{}, reqErr
	}

	return normalizedPublishPodRequest{
		ID:                    podID,
		Title:                 title,
		Description:           description,
		Image:                 image,
		Status:                status,
		SourceFolderID:        podFolderID,
		CreatorIDs:            creatorIDs,
		AudienceIDs:           audienceIDs,
		VirtualMachines:       vms,
		UpdateVirtualMachines: updateVMs,
		Tasks:                 tasks,
	}, nil
}

func (h *PodsHandler) replacePublishedPodChildren(
	ctx context.Context,
	q *database.Queries,
	req normalizedPublishPodRequest,
) *requestError {
	existingTasks, err := q.ListPublishedPodTasksByPodIDs(ctx, []uuid.UUID{req.ID})
	if err != nil {
		return &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "failed to replace published pod details",
			Operation:   "load existing published pod tasks",
			Err:         err,
		}
	}
	existingTaskIDs := make(map[uuid.UUID]struct{}, len(existingTasks))
	existingTaskIDList := make([]uuid.UUID, 0, len(existingTasks))
	for _, task := range existingTasks {
		existingTaskIDs[task.ID] = struct{}{}
		existingTaskIDList = append(existingTaskIDList, task.ID)
	}

	existingQuestionsByID := map[uuid.UUID]database.ListPublishedPodQuestionsByTaskIDsRow{}
	if len(existingTaskIDList) > 0 {
		existingQuestions, err := q.ListPublishedPodQuestionsByTaskIDs(ctx, existingTaskIDList)
		if err != nil {
			return &requestError{
				Status:      http.StatusInternalServerError,
				UserMessage: "failed to replace published pod details",
				Operation:   "load existing published pod questions",
				Err:         err,
			}
		}
		for _, question := range existingQuestions {
			existingQuestionsByID[question.ID] = question
		}
	}

	for _, deleteFn := range []func(context.Context, uuid.UUID) error{
		q.DeletePublishedPodCreators,
		q.DeletePublishedPodAudience,
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
	if err := q.OffsetPublishedPodTaskSortOrders(ctx, database.OffsetPublishedPodTaskSortOrdersParams{
		PodID:      req.ID,
		SortOffset: publishPodSortOrderOffset,
	}); err != nil {
		return &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "failed to replace published pod details",
			Operation:   "offset published pod task sort orders",
			Err:         err,
		}
	}
	if err := q.OffsetPublishedPodQuestionSortOrders(ctx, database.OffsetPublishedPodQuestionSortOrdersParams{
		PodID:      req.ID,
		SortOffset: publishPodSortOrderOffset,
	}); err != nil {
		return &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "failed to replace published pod details",
			Operation:   "offset published pod question sort orders",
			Err:         err,
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
	keptVMIDs := make([]uuid.UUID, 0, len(req.VirtualMachines))
	for index, vm := range req.VirtualMachines {
		publishedVMID := vm.PublishedPodVMID
		if publishedVMID == uuid.Nil {
			publishedVMID = uuid.New()
			if err := q.InsertPublishedPodVM(ctx, database.InsertPublishedPodVMParams{
				ID:                    publishedVMID,
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
			keptVMIDs = append(keptVMIDs, publishedVMID)
			continue
		}

		if err := q.UpdatePublishedPodVM(ctx, database.UpdatePublishedPodVMParams{
			ID:                    publishedVMID,
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
			return childInsertError("update published pod vm", err)
		}
		keptVMIDs = append(keptVMIDs, publishedVMID)
	}
	if err := q.DeletePublishedPodVMsExcept(ctx, database.DeletePublishedPodVMsExceptParams{
		PodID:   req.ID,
		KeepIds: keptVMIDs,
	}); err != nil {
		return &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "failed to replace published pod details",
			Operation:   "delete removed published pod VMs",
			Err:         err,
		}
	}
	keptTaskIDs := make([]uuid.UUID, 0, len(req.Tasks))
	keptQuestionIDs := make([]uuid.UUID, 0)
	for taskIndex, task := range req.Tasks {
		taskID := task.ID
		keptTaskIDs = append(keptTaskIDs, taskID)
		if _, ok := existingTaskIDs[taskID]; ok {
			if err := q.UpdatePublishedPodTask(ctx, database.UpdatePublishedPodTaskParams{
				ID:        taskID,
				PodID:     req.ID,
				Title:     task.Title,
				Content:   task.Content,
				SortOrder: int32(taskIndex),
			}); err != nil {
				return childInsertError("update published pod task", err)
			}
		} else {
			if _, err := q.InsertPublishedPodTask(ctx, database.InsertPublishedPodTaskParams{
				ID:        taskID,
				PodID:     req.ID,
				Title:     task.Title,
				Content:   task.Content,
				SortOrder: int32(taskIndex),
			}); err != nil {
				return childInsertError("insert published pod task", err)
			}
		}
		for questionIndex, question := range task.Questions {
			questionID := question.ID
			keptQuestionIDs = append(keptQuestionIDs, questionID)
			if existing, ok := existingQuestionsByID[questionID]; ok {
				if publishedPodQuestionAnswerStateChanged(existing, question) {
					if err := q.DeleteClonedPodQuestionAnswersByQuestionID(ctx, questionID); err != nil {
						return &requestError{
							Status:      http.StatusInternalServerError,
							UserMessage: "failed to replace published pod details",
							Operation:   "reset changed published pod question answers",
							Err:         err,
						}
					}
				}
				if err := q.UpdatePublishedPodTaskQuestion(ctx, database.UpdatePublishedPodTaskQuestionParams{
					ID:            questionID,
					TaskID:        taskID,
					Title:         question.Title,
					AnswerOutline: question.AnswerOutline,
					Description:   question.Description,
					Hint:          question.Hint,
					SortOrder:     int32(questionIndex),
				}); err != nil {
					return childInsertError("update published pod task question", err)
				}
			} else {
				if err := q.InsertPublishedPodTaskQuestion(ctx, database.InsertPublishedPodTaskQuestionParams{
					ID:            questionID,
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
	}
	if err := q.DeletePublishedPodQuestionsExcept(ctx, database.DeletePublishedPodQuestionsExceptParams{
		PodID:   req.ID,
		KeepIds: keptQuestionIDs,
	}); err != nil {
		return &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "failed to replace published pod details",
			Operation:   "delete removed published pod questions",
			Err:         err,
		}
	}
	if err := q.DeletePublishedPodTasksExcept(ctx, database.DeletePublishedPodTasksExceptParams{
		PodID:   req.ID,
		KeepIds: keptTaskIDs,
	}); err != nil {
		return &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "failed to replace published pod details",
			Operation:   "delete removed published pod tasks",
			Err:         err,
		}
	}
	if err := q.RefreshClonedPodTaskStatesForPublishedPod(ctx, req.ID); err != nil {
		return &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "failed to replace published pod details",
			Operation:   "refresh cloned pod task states",
			Err:         err,
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
	wantTypes := make(map[uuid.UUID]string, len(principals))
	for _, principal := range principals {
		principalID, err := uuid.Parse(principal.ID)
		if err != nil {
			return nil, invalidPublishPod("invalid principal id")
		}
		if _, ok := seen[principalID]; ok {
			continue
		}
		seen[principalID] = struct{}{}
		ids = append(ids, principalID)
		wantTypes[principalID] = principal.Type
	}
	if len(ids) < minCount {
		return nil, invalidPublishPod(fmt.Sprintf("add at least %d %s", minCount, label))
	}
	if len(ids) == 0 {
		return ids, nil
	}

	rows, err := q.GetPrincipalsByIDs(ctx, ids)
	if err != nil {
		return nil, &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "failed to validate principals",
			Operation:   "validate published pod principals",
			Err:         err,
		}
	}
	gotTypes := make(map[uuid.UUID]database.PrincipalType, len(rows))
	for _, row := range rows {
		gotTypes[row.ID] = row.PrincipalType
	}
	for _, id := range ids {
		principalType, ok := gotTypes[id]
		if !ok {
			return nil, invalidPublishPod("principal not found")
		}
		if want := wantTypes[id]; want != "" && want != string(principalType) {
			return nil, invalidPublishPod("principal type does not match")
		}
	}

	return ids, nil
}

func normalizePublishPodVMs(
	requestVMs []publishPodVMRequest,
	podVMs []publishPodVMOption,
) ([]normalizedPublishPodVM, *requestError) {
	if len(requestVMs) == 0 {
		return nil, invalidPublishPod("select a Pod Folder with at least one VM")
	}
	if len(requestVMs) != len(podVMs) {
		return nil, invalidPublishPod("published VMs must match the selected Pod Folder")
	}

	podVMByID := make(map[uuid.UUID]publishPodVMOption, len(podVMs))
	podVMByName := make(map[string]publishPodVMOption, len(podVMs))
	for _, vm := range podVMs {
		podVMByID[vm.ID] = vm
		podVMByName[strings.ToLower(vm.Name)] = vm
	}

	seen := make(map[uuid.UUID]struct{}, len(requestVMs))
	vms := make([]normalizedPublishPodVM, 0, len(requestVMs))
	for _, vm := range requestVMs {
		vmID, err := uuid.Parse(vm.ID)
		if err != nil {
			return nil, invalidPublishPod("invalid VM id")
		}
		podVM, ok := podVMByID[vmID]
		if !ok {
			podVM, ok = podVMByName[strings.ToLower(strings.TrimSpace(vm.Name))]
		}
		if !ok {
			return nil, invalidPublishPod("VM is not available in the selected Pod Folder")
		}
		if _, ok := seen[podVM.ID]; ok {
			return nil, invalidPublishPod("duplicate VM in publish request")
		}
		if err := validatePublishedPodPermissions(vm.Permissions); err != nil {
			return nil, invalidPublishPod(err.Error())
		}

		seen[podVM.ID] = struct{}{}
		vms = append(vms, normalizedPublishPodVM{
			RequestInventoryItemID: vmID,
			SourceInventoryItemID:  podVM.ID,
			Name:                   podVM.Name,
			CPUCount:               podVM.CPUCount,
			MemoryGB:               podVM.MemoryGB,
			StorageGB:              podVM.StorageGB,
			AllowMask:              vm.Permissions.AllowMask,
			DenyMask:               vm.Permissions.DenyMask,
		})
	}

	return vms, nil
}

func normalizePublishPodUpdateVMs(values []string) ([]uuid.UUID, *requestError) {
	if len(values) == 0 {
		return []uuid.UUID{}, nil
	}

	seen := make(map[uuid.UUID]struct{}, len(values))
	ids := make([]uuid.UUID, 0, len(values))
	for _, value := range values {
		id, err := uuid.Parse(strings.TrimSpace(value))
		if err != nil {
			return nil, invalidPublishPod("invalid VM update id")
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		ids = append(ids, id)
	}

	return ids, nil
}

func preservePublishedPodTemplateRefs(
	requestVMs []normalizedPublishPodVM,
	existingVMs []database.ListPublishedPodVMsByPodIDsRow,
) ([]normalizedPublishPodVM, *requestError) {
	if len(requestVMs) != len(existingVMs) {
		return nil, invalidPublishPod("published VMs must match the selected Pod Folder")
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
			return nil, invalidPublishPod("published VMs must match the existing Pod Template VMs")
		}
		if _, ok := seen[existing.SourceInventoryItemID]; ok {
			return nil, invalidPublishPod("duplicate VM in publish request")
		}

		seen[existing.SourceInventoryItemID] = struct{}{}
		preserved = append(preserved, normalizedPublishPodVM{
			PublishedPodVMID:       existing.ID,
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

func (h *PodsHandler) updatePublishedPodTemplates(
	ctx context.Context,
	principalID uuid.UUID,
	req normalizedPublishPodRequest,
	existingVMs []database.ListPublishedPodVMsByPodIDsRow,
	progress *publishPodProgressReporter,
) ([]normalizedPublishPodVM, []uuid.UUID, *requestError) {
	if len(req.VirtualMachines) != len(existingVMs) {
		return nil, nil, invalidPublishPod("published VMs must match the selected Pod Folder")
	}

	selected := make(map[uuid.UUID]struct{}, len(req.UpdateVirtualMachines))
	for _, id := range req.UpdateVirtualMachines {
		selected[id] = struct{}{}
	}

	existingByID := make(map[uuid.UUID]database.ListPublishedPodVMsByPodIDsRow, len(existingVMs))
	existingByName := make(map[string]database.ListPublishedPodVMsByPodIDsRow, len(existingVMs))
	for _, vm := range existingVMs {
		existingByID[vm.SourceInventoryItemID] = vm
		existingByName[strings.ToLower(vm.Name)] = vm
	}

	seenExisting := make(map[uuid.UUID]struct{}, len(req.VirtualMachines))
	matchedSelected := make(map[uuid.UUID]struct{}, len(selected))
	publishedVMIDByRequestID := make(map[uuid.UUID]uuid.UUID, len(selected))
	updateVMs := make([]normalizedPublishPodVM, 0, len(selected))
	replacedTemplateIDs := make([]uuid.UUID, 0, len(selected))
	output := make([]normalizedPublishPodVM, len(req.VirtualMachines))

	for index, requestVM := range req.VirtualMachines {
		existing, ok := existingByID[requestVM.RequestInventoryItemID]
		if !ok {
			existing, ok = existingByName[strings.ToLower(requestVM.Name)]
		}
		if !ok {
			return nil, nil, invalidPublishPod("published VMs must match the existing Pod Template VMs")
		}
		if _, ok := seenExisting[existing.SourceInventoryItemID]; ok {
			return nil, nil, invalidPublishPod("duplicate VM in publish request")
		}
		seenExisting[existing.SourceInventoryItemID] = struct{}{}

		update := markSelectedUpdateVM(
			selected,
			matchedSelected,
			requestVM.RequestInventoryItemID,
			requestVM.SourceInventoryItemID,
			existing.SourceInventoryItemID,
		)
		if !update {
			output[index] = normalizedPublishPodVM{
				PublishedPodVMID:       existing.ID,
				RequestInventoryItemID: requestVM.RequestInventoryItemID,
				SourceInventoryItemID:  existing.SourceInventoryItemID,
				Name:                   existing.Name,
				CPUCount:               existing.CpuCount,
				MemoryGB:               memoryMBToGB(&existing.MemoryMb),
				StorageGB:              diskGBToInt(&existing.DiskGb),
				AllowMask:              requestVM.AllowMask,
				DenyMask:               requestVM.DenyMask,
			}
			continue
		}

		updateVMs = append(updateVMs, requestVM)
		publishedVMIDByRequestID[requestVM.RequestInventoryItemID] = existing.ID
		replacedTemplateIDs = append(replacedTemplateIDs, existing.SourceInventoryItemID)
	}

	if len(matchedSelected) != len(selected) {
		return nil, nil, invalidPublishPod("selected VM updates must match the published pod VMs")
	}
	if len(updateVMs) == 0 {
		return output, []uuid.UUID{}, nil
	}

	progress.set(publishProgressStepPreparing, "Preparing selected Pod Template VMs for update.")
	templateFolderID, err := h.Service.EnsureChildFolderWithDescription(
		ctx,
		req.SourceFolderID,
		publishedPodTemplateFolderName,
		new(inventory.PurposePublishedPodTemplateFolderDescription),
	)
	if err != nil {
		return nil, nil, inventoryRequestError(err)
	}
	if reqErr := requireInventoryPermissionRequest(
		ctx,
		h.Authz,
		principalID,
		templateFolderID,
		authorization.CreateVM,
		"authorize published Pod Template VM update",
	); reqErr != nil {
		return nil, nil, reqErr
	}

	placement, err := h.Service.ResolveFolderPlacement(ctx, templateFolderID)
	if err != nil {
		return nil, nil, inventoryRequestError(err)
	}

	targetNode, err := h.resolveCloneTargetNode(ctx)
	if err != nil {
		return nil, nil, &requestError{
			Status:      http.StatusBadGateway,
			UserMessage: "failed to resolve target node",
			Operation:   "resolve published pod template update target node",
			Err:         err,
		}
	}

	updated, reqErr := h.clonePreparedVMsIntoTemplates(ctx, principalID, placement, targetNode, updateVMs, progress)
	if reqErr != nil {
		return nil, nil, reqErr
	}
	updatedByRequestID := make(map[uuid.UUID]normalizedPublishPodVM, len(updated))
	for _, vm := range updated {
		updatedByRequestID[vm.RequestInventoryItemID] = vm
	}
	for index, requestVM := range req.VirtualMachines {
		if output[index].SourceInventoryItemID != uuid.Nil {
			continue
		}
		updatedVM, ok := updatedByRequestID[requestVM.RequestInventoryItemID]
		if !ok {
			return nil, nil, invalidPublishPod("failed to match updated VM")
		}
		updatedVM.PublishedPodVMID = publishedVMIDByRequestID[requestVM.RequestInventoryItemID]
		output[index] = updatedVM
	}

	return output, replacedTemplateIDs, nil
}

func markSelectedUpdateVM(
	selected map[uuid.UUID]struct{},
	matched map[uuid.UUID]struct{},
	ids ...uuid.UUID,
) bool {
	update := false
	for _, id := range ids {
		if _, ok := selected[id]; ok {
			matched[id] = struct{}{}
			update = true
		}
	}
	return update
}

func (h *PodsHandler) preparePublishedPodTemplates(
	ctx context.Context,
	principalID uuid.UUID,
	req normalizedPublishPodRequest,
	progress *publishPodProgressReporter,
) ([]normalizedPublishPodVM, *requestError) {
	if req.SourceFolderID == uuid.Nil {
		return nil, invalidPublishPod("select a Pod Folder")
	}
	if len(req.VirtualMachines) == 0 {
		return nil, invalidPublishPod("select a Pod Folder with at least one VM")
	}

	if reqErr := requireInventoryPermissionRequest(
		ctx,
		h.Authz,
		principalID,
		req.SourceFolderID,
		authorization.CreateFolder,
		"authorize published pod template folder creation",
	); reqErr != nil {
		return nil, reqErr
	}

	progress.set(publishProgressStepPreparing, "Creating or finding the Pod Template Folder inside the selected Pod Folder.")

	templateFolderID, err := h.Service.EnsureChildFolderWithDescription(
		ctx,
		req.SourceFolderID,
		publishedPodTemplateFolderName,
		new(inventory.PurposePublishedPodTemplateFolderDescription),
	)
	if err != nil {
		return nil, inventoryRequestError(err)
	}
	if reqErr := requireInventoryPermissionRequest(
		ctx,
		h.Authz,
		principalID,
		templateFolderID,
		authorization.CreateVM,
		"authorize published Pod Template VM creation",
	); reqErr != nil {
		return nil, reqErr
	}
	reservation, err := h.Service.ReserveFolderVMCapacity(ctx, templateFolderID, int32(len(req.VirtualMachines)), "pod_template_vms")
	if err != nil {
		return nil, inventoryRequestError(err)
	}
	if reservation != nil {
		defer reservation.Release(ctx)
	}

	placement, err := h.Service.ResolveFolderPlacement(ctx, templateFolderID)
	if err != nil {
		return nil, inventoryRequestError(err)
	}

	targetNode, err := h.resolveCloneTargetNode(ctx)
	if err != nil {
		return nil, &requestError{
			Status:      http.StatusBadGateway,
			UserMessage: "failed to resolve target node",
			Operation:   "resolve published pod template clone target node",
			Err:         err,
		}
	}

	prepared, reqErr := h.clonePreparedVMsIntoTemplates(ctx, principalID, placement, targetNode, req.VirtualMachines, progress)
	if reqErr != nil {
		return nil, reqErr
	}

	return prepared, nil
}

// clonePreparedVMsIntoTemplates clones each Pod VM into the Pod Template Folder
// and converts it to a Pod Template VM, a few at a time, cleaning up on any
// failure.
func (h *PodsHandler) clonePreparedVMsIntoTemplates(
	ctx context.Context,
	principalID uuid.UUID,
	placement inventory.FolderPlacement,
	targetNode string,
	vms []normalizedPublishPodVM,
	progress *publishPodProgressReporter,
) ([]normalizedPublishPodVM, *requestError) {
	prepared := make([]normalizedPublishPodVM, len(vms))
	routerTemplateID := uuid.Nil
	for _, vm := range vms {
		if !isPodRouterName(vm.Name) {
			continue
		}

		var err error
		routerTemplateID, err = publishedPodVMTemplateItemID(
			vm.Name,
			vm.SourceInventoryItemID,
			h.RouterTemplateItemID,
		)
		if err != nil {
			return nil, &requestError{
				Status:      http.StatusConflict,
				UserMessage: err.Error(),
			}
		}
		if _, reqErr := h.resolvePublishedPodVMTemplate(ctx, routerTemplateID); reqErr != nil {
			return nil, reqErr
		}
		break
	}

	// Count non-router VMs; only those are cloned and need VMID allocation.
	nonRouterCount := 0
	for _, vm := range vms {
		if !isPodRouterName(vm.Name) {
			nonRouterCount++
		}
	}
	var batch *vmidalloc.Batch
	if nonRouterCount > 0 {
		var batchErr error
		batch, batchErr = h.Allocator.NewBatch(ctx, h.PublishVMIDRange, nonRouterCount)
		if batchErr != nil {
			return nil, &requestError{
				Status:      http.StatusBadGateway,
				UserMessage: fmt.Sprintf("insufficient VMID capacity in publish range (%d–%d) for %d VMs", h.PublishVMIDRange.Min, h.PublishVMIDRange.Max, nonRouterCount),
				Operation:   "allocate publish VMID batch",
				Err:         batchErr,
			}
		}
	}

	created := make(map[int]clonedVM, len(vms))
	var createdMu sync.Mutex

	group, gctx := errgroup.WithContext(ctx)
	group.SetLimit(publishCloneConcurrency)

	for i, vm := range vms {
		if isPodRouterName(vm.Name) {
			out := vm
			out.SourceInventoryItemID = routerTemplateID
			prepared[i] = out
			continue
		}

		group.Go(func() error {
			progress.set(publishProgressStepCloning, "Cloning Pod VM "+vm.Name)
			clone, reqErr := h.cloneVMIntoFolder(gctx, principalID, vm.SourceInventoryItemID, placement, targetNode, vm.Name, true, cloneVMOptions{
				batch: batch,
				onStarted: func(node string, vmid int) {
					createdMu.Lock()
					created[vmid] = clonedVM{TargetNode: node, VMID: vmid}
					createdMu.Unlock()
				},
			})
			if reqErr != nil {
				return reqErr
			}
			createdMu.Lock()
			created[clone.VMID] = clone
			createdMu.Unlock()

			progress.set(publishProgressStepCloning, "Converting "+vm.Name+" to a Pod Template VM")
			if reqErr := h.convertCloneToTemplate(gctx, clone); reqErr != nil {
				return reqErr
			}

			out := vm
			out.SourceInventoryItemID = clone.InventoryItemID
			prepared[i] = out
			return nil
		})
	}

	if err := group.Wait(); err != nil {
		h.cleanupPublishClones(created)
		var reqErr *requestError
		if errors.As(err, &reqErr) {
			return nil, reqErr
		}
		return nil, &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "failed to clone Pod VMs",
			Operation:   "clone published pod VMs",
			Err:         err,
		}
	}

	return prepared, nil
}

type clonedVM struct {
	SourceItemID    uuid.UUID
	InventoryItemID uuid.UUID
	TargetNode      string
	VMID            int
}

// cloneVMOptions holds concurrency/cleanup hooks for VM cloning.
type cloneVMOptions struct {
	batch     *vmidalloc.Batch
	onStarted func(node string, vmid int)
	onSynced  func(clonedVM)
}

// cloneVMIntoFolder authorizes the source, clones it into the folder, stamps a
// fresh identity, syncs pool membership, and imports it into the inventory.
func (h *PodsHandler) cloneVMIntoFolder(
	ctx context.Context,
	principalID uuid.UUID,
	sourceItemID uuid.UUID,
	placement inventory.FolderPlacement,
	targetNode string,
	name string,
	full bool,
	opts cloneVMOptions,
) (clonedVM, *requestError) {
	source, reqErr := resolveVerifiedVMItemPermission(
		ctx,
		h.Authz,
		h.PX,
		principalID,
		sourceItemID,
		authorization.CloneVM,
		true,
	)
	if reqErr != nil {
		return clonedVM{}, reqErr
	}

	return h.cloneVerifiedVMIntoFolder(ctx, source, sourceItemID, placement, targetNode, name, full, opts)
}

func (h *PodsHandler) cloneVerifiedVMIntoFolder(
	ctx context.Context,
	source verifiedVMTarget,
	sourceItemID uuid.UUID,
	placement inventory.FolderPlacement,
	targetNode string,
	name string,
	full bool,
	opts cloneVMOptions,
) (clonedVM, *requestError) {
	task, newID, reqErr := h.startVMClone(ctx, source, targetNode, name, full, opts.batch)
	if reqErr != nil {
		return clonedVM{}, reqErr
	}
	if opts.onStarted != nil {
		opts.onStarted(targetNode, newID)
	}

	if err := h.PX.WaitForTask(ctx, task.Node, task.UPID); err != nil {
		return clonedVM{}, &requestError{
			Status:      http.StatusBadGateway,
			UserMessage: "failed to clone VM",
			Operation:   "clone pod VM",
			Err:         err,
		}
	}
	if err := h.PX.SetVMUpstreamUUID(ctx, targetNode, newID, uuid.New()); err != nil {
		return clonedVM{}, &requestError{
			Status:      http.StatusBadGateway,
			UserMessage: "failed to assign clone identity",
			Operation:   "assign pod clone identity",
			Err:         err,
		}
	}
	if err := h.PX.SyncVMPoolMembership(ctx, targetNode, newID, placement.PoolID, placement.Path); err != nil {
		return clonedVM{}, &requestError{
			Status:      http.StatusBadGateway,
			UserMessage: "failed to sync VM pool membership",
			Operation:   "sync pod clone pool membership",
			Err:         err,
		}
	}

	clonedItemID, err := h.Importer.SyncVM(ctx, placement.FolderID, targetNode, newID)
	if err != nil {
		return clonedVM{}, &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "vm cloned in Proxmox but failed to sync inventory metadata",
			Operation:   "sync pod clone inventory metadata",
			Err:         err,
		}
	}

	clone := clonedVM{
		SourceItemID:    sourceItemID,
		InventoryItemID: clonedItemID,
		TargetNode:      targetNode,
		VMID:            newID,
	}
	if opts.onSynced != nil {
		opts.onSynced(clone)
	}

	return clone, nil
}

// startVMClone claims a VMID via batch and starts the clone task.
func (h *PodsHandler) startVMClone(
	ctx context.Context,
	source verifiedVMTarget,
	targetNode string,
	name string,
	full bool,
	batch *vmidalloc.Batch,
) (proxmox.CloneTask, int, *requestError) {
	var task proxmox.CloneTask
	newID, err := batch.Claim(ctx, func(vmid int) error {
		var cloneErr error
		task, cloneErr = h.PX.StartCloneVM(ctx, source.Node, source.VMID, vmid, name, full, targetNode)
		return cloneErr
	})
	if err != nil {
		if vmidalloc.IsRangeExhausted(err) {
			return proxmox.CloneTask{}, 0, &requestError{
				Status:      http.StatusBadGateway,
				UserMessage: "no available VMID in the configured workflow range",
				Operation:   "allocate pod clone vmid",
				Err:         err,
			}
		}
		return proxmox.CloneTask{}, 0, &requestError{
			Status:      http.StatusBadGateway,
			UserMessage: "failed to clone VM",
			Operation:   "start pod clone",
			Err:         err,
		}
	}
	return task, newID, nil
}

func (h *PodsHandler) convertCloneToTemplate(ctx context.Context, clone clonedVM) *requestError {
	if err := h.PX.ConvertToTemplate(ctx, clone.TargetNode, clone.VMID); err != nil {
		return &requestError{
			Status:      http.StatusBadGateway,
			UserMessage: "failed to convert Pod VM clone to Pod Template VM",
			Operation:   "convert published pod VM clone to Pod Template VM",
			Err:         err,
		}
	}

	if err := h.Service.UpdateInventoryVMIsTemplate(ctx, clone.InventoryItemID); err != nil {
		return &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "Pod VM clone converted in Proxmox but failed to update inventory metadata",
			Operation:   "update published pod VM clone Pod Template VM state",
			Err:         err,
		}
	}

	h.Service.NotifyInventoryChanged(ctx, clone.InventoryItemID)

	return nil
}

// cleanupPublishClones best-effort deletes clones from a failed publish, using a
// fresh context since the publish context is usually already cancelled.
func (h *PodsHandler) cleanupPublishClones(created map[int]clonedVM) {
	if len(created) == 0 {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	for _, clone := range created {
		if err := h.PX.DeleteVM(ctx, clone.TargetNode, clone.VMID); err != nil {
			log.Printf("publish cleanup: failed to delete Proxmox VM %d on %s: %v", clone.VMID, clone.TargetNode, err)
		}
		if clone.InventoryItemID != uuid.Nil {
			if err := h.Service.DeleteInventoryVM(ctx, clone.InventoryItemID); err != nil {
				log.Printf("publish cleanup: failed to delete inventory item %s: %v", clone.InventoryItemID, err)
			}
		}
	}
}

func (h *PodsHandler) cleanupPublishedPodTemplates(templateItemIDs []uuid.UUID) {
	if len(templateItemIDs) == 0 {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	if reqErr := h.deletePublishedPodTemplates(ctx, templateItemIDs); reqErr != nil {
		log.Printf("publish cleanup: failed to delete orphaned Pod Template VMs: %s", reqErr.Error())
	}
}

func (h *PodsHandler) deletePublishedPodTemplates(ctx context.Context, templateItemIDs []uuid.UUID) *requestError {
	q := database.New(h.DB)
	for _, id := range templateItemIDs {
		if id == uuid.Nil || id == h.RouterTemplateItemID {
			continue
		}

		row, err := q.GetProxmoxVMByInventoryItemID(ctx, id)
		if errors.Is(err, pgx.ErrNoRows) {
			continue
		}
		if err != nil {
			return &requestError{
				Status:      http.StatusInternalServerError,
				UserMessage: "failed to load replaced Pod Template VM",
				Operation:   "load replaced published Pod Template VM",
				Err:         err,
			}
		}

		if err := h.deleteClonedPodProxmoxVM(ctx, row.Node, int(row.Vmid)); err != nil {
			return &requestError{
				Status:      http.StatusBadGateway,
				UserMessage: "failed to delete replaced Pod Template VM",
				Operation:   "delete replaced published Pod Template VM",
				Err:         err,
			}
		}
		if err := h.Service.DeleteInventoryVM(ctx, id); err != nil {
			return &requestError{
				Status:      http.StatusInternalServerError,
				UserMessage: "failed to delete replaced Pod Template VM metadata",
				Operation:   "delete replaced published Pod Template VM inventory item",
				Err:         err,
			}
		}
	}

	return nil
}

func publishedPodTemplateIDs(vms []normalizedPublishPodVM) []uuid.UUID {
	ids := make([]uuid.UUID, 0, len(vms))
	for _, vm := range vms {
		if vm.SourceInventoryItemID != uuid.Nil {
			ids = append(ids, vm.SourceInventoryItemID)
		}
	}
	return ids
}

func newPublishedPodTemplateIDs(
	vms []normalizedPublishPodVM,
	existingVMs []database.ListPublishedPodVMsByPodIDsRow,
) []uuid.UUID {
	existing := make(map[uuid.UUID]struct{}, len(existingVMs))
	for _, vm := range existingVMs {
		existing[vm.SourceInventoryItemID] = struct{}{}
	}

	ids := make([]uuid.UUID, 0, len(vms))
	for _, vm := range vms {
		if vm.SourceInventoryItemID == uuid.Nil {
			continue
		}
		if _, ok := existing[vm.SourceInventoryItemID]; ok {
			continue
		}
		ids = append(ids, vm.SourceInventoryItemID)
	}
	return ids
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
	publishPodSortOrderOffset       = 10000
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

func publishedPodQuestionAnswerStateChanged(
	existing database.ListPublishedPodQuestionsByTaskIDsRow,
	next normalizedPublishPodQuestion,
) bool {
	return existing.Title != next.Title || !answersMatch(existing.AnswerOutline, next.AnswerOutline)
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

func findPodFolder(
	folders []publishPodFolderOption,
	folderID uuid.UUID,
) (publishPodFolderOption, bool) {
	index := slices.IndexFunc(folders, func(folder publishPodFolderOption) bool {
		return folder.ID == folderID
	})
	if index < 0 {
		return publishPodFolderOption{}, false
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

func (h *PodsHandler) buildCloneSpecs(req createPodRequest) ([]podCloneSpec, error) {
	specs := make([]podCloneSpec, 0)

	if req.IncludeRouter {
		if h.RouterTemplateItemID == uuid.Nil {
			return nil, fmt.Errorf("router template is not configured")
		}
		specs = append(specs, podCloneSpec{
			TemplateItemID: h.RouterTemplateItemID,
			Name:           "router",
			Router:         true,
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
	placement inventory.FolderPlacement,
	targetNode string,
	spec podCloneSpec,
	opts cloneVMOptions,
) (createPodVMResult, *requestError) {
	item, err := h.Service.GetInventoryItemByID(ctx, spec.TemplateItemID)
	switch {
	case err == nil:
	case errors.Is(err, pgx.ErrNoRows):
		return createPodVMResult{}, &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "configured pod template was not found",
			Operation:   "load pod template inventory item",
			Err:         err,
		}
	default:
		return createPodVMResult{}, &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "failed to load template",
			Operation:   "load pod template inventory item",
			Err:         err,
		}
	}
	if item.IsTemplate == nil || !*item.IsTemplate {
		return createPodVMResult{}, &requestError{
			Status:      http.StatusUnprocessableEntity,
			UserMessage: "selected VM is not a template",
		}
	}

	clone, reqErr := h.cloneVMIntoFolder(ctx, principalID, spec.TemplateItemID, placement, targetNode, spec.Name, false, opts)
	if reqErr != nil {
		return createPodVMResult{}, reqErr
	}

	if spec.Hardware != nil {
		if err := h.applyCloneHardware(ctx, targetNode, clone.VMID, clone.InventoryItemID, *spec.Hardware); err != nil {
			return createPodVMResult{}, &requestError{
				Status:      http.StatusUnprocessableEntity,
				UserMessage: err.Error(),
				Operation:   "apply pod clone hardware",
				Err:         err,
			}
		}
	}

	h.Service.NotifyInventoryChanged(ctx, clone.InventoryItemID)

	clonedItem, err := h.Service.GetInventoryItemWithPermissions(ctx, principalID, clone.InventoryItemID)
	if err != nil {
		return createPodVMResult{}, &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "vm cloned in Proxmox but failed to load inventory item",
			Operation:   "load pod clone inventory item",
			Err:         err,
		}
	}

	return createPodVMResult{
		response: createPodVMResponse{
			TemplateItemID: spec.TemplateItemID,
			VMID:           clone.VMID,
			ItemID:         clone.InventoryItemID,
			Item:           buildInventoryItem(clonedItem),
		},
		target: podNetworkVMTarget{
			name:   spec.Name,
			clone:  clone,
			router: spec.Router,
		},
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
		errors.Is(err, names.ErrMustStartWithAlnum),
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
