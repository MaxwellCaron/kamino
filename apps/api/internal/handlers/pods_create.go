package handlers

import (
	"net/http"
	"strings"

	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/MaxwellCaron/kamino/internal/names"
	"github.com/MaxwellCaron/kamino/internal/podnetwork"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

func (h *PodsHandler) GetCreateProgress(c *gin.Context) {
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

	snapshot, ok := createPodProgress.get(progressID)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "progress not found"})
		return
	}

	c.JSON(http.StatusOK, snapshot)
}

type podCreateOptionsResponse struct {
	RouterTemplateConfigured bool                       `json:"router_template_configured"`
	NetworkProfiles          []podnetwork.PublicProfile `json:"network_profiles"`
	Templates                []templateLibraryOption    `json:"templates"`
}

type podNameAvailabilityResponse struct {
	Available bool `json:"available"`
}

type createPodVMRequest struct {
	Name       string  `json:"name" binding:"required"`
	CPUCount   int     `json:"cpu_count"`
	MemoryGB   int     `json:"memory_gb"`
	StorageGB  int     `json:"storage_gb"`
	SegmentKey *string `json:"segment_key"`
}

type createPodTemplateRequest struct {
	TemplateItemID string               `json:"template_item_id" binding:"required"`
	VMs            []createPodVMRequest `json:"vms" binding:"required,min=1"`
}

type createPodRequest struct {
	Name              string                     `json:"name" binding:"required"`
	NetworkProfileKey string                     `json:"network_profile_key"`
	Templates         []createPodTemplateRequest `json:"templates"`
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
	SegmentKey     string
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
		writeUnauthorized(c)
		return
	}
	if !requireManagementPermission(c, h.Authz, principalID, authorization.ManagementPermissionManager) {
		return
	}

	templates, err := loadTemplateLibraryOptions(
		c.Request.Context(), h.Service, h.TemplatesFolderItemID,
	)
	if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to load templates", "load pod template options", err)
		return
	}

	visibleTemplates := templates[:0]
	for _, template := range templates {
		if h.RouterTemplateItemID != uuid.Nil && template.ID == h.RouterTemplateItemID {
			continue
		}
		visibleTemplates = append(visibleTemplates, template)
	}

	c.JSON(http.StatusOK, podCreateOptionsResponse{
		RouterTemplateConfigured: h.RouterTemplateItemID != uuid.Nil,
		NetworkProfiles:          h.publicNetworkProfiles(),
		Templates:                visibleTemplates,
	})
}

func (h *PodsHandler) publicNetworkProfiles() []podnetwork.PublicProfile {
	if h.NetworkCatalog == nil {
		return []podnetwork.PublicProfile{}
	}
	return h.NetworkCatalog.PublicProfiles()
}

func (h *PodsHandler) ValidateCreateName(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		writeUnauthorized(c)
		return
	}
	if !requireManagementPermission(c, h.Authz, principalID, authorization.ManagementPermissionManager) {
		return
	}

	name := names.Normalize(c.Query("name"))
	if err := names.ValidateFolder(name); err != nil {
		writeLoggedError(c, http.StatusUnprocessableEntity, err.Error(), "validate pod folder name", err)
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
