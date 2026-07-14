package handlers

import (
	"context"
	"errors"
	"math"
	"net/http"
	"net/netip"
	"strings"
	"time"
	"unicode"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/audit"
	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/MaxwellCaron/kamino/internal/inventory"
	"github.com/MaxwellCaron/kamino/internal/names"
	"github.com/MaxwellCaron/kamino/internal/podnetwork"
	"github.com/MaxwellCaron/kamino/internal/proxmox"
	"github.com/MaxwellCaron/kamino/internal/proxmox/vmstatus"
	"github.com/MaxwellCaron/kamino/internal/vmactions"
	"github.com/MaxwellCaron/kamino/internal/vmidalloc"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type PodRouterCloneConfig struct {
	VNetPrefix                       string
	LANVLANBase                      int
	DMZVNetPrefix                    string
	DMZVLANBase                      int
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
	LANDMZCloudInitUserFilePattern   string
	LANDMZCloudInitNetworkFile       string
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
	NetworkCatalog                  *podnetwork.Catalog
	Audit                           *audit.Service
	TemplatesFolderItemID           uuid.UUID
	PodsFolderItemID                uuid.UUID
	PersonalPodsFolderItemID        uuid.UUID
	Allocator                       *vmidalloc.Allocator
	PublishVMIDRange                vmidalloc.Range
	CloneVMIDRange                  vmidalloc.Range
	DevVMIDRange                    vmidalloc.Range
	PersonalVMIDRange               vmidalloc.Range
	PodCloneClaims                  PodCloneClaimStore
	PodProvisionLimiter             *PodProvisionLimiter
	VMActionClaims                  VMActionClaimStore
}

type VMActionClaimStore interface {
	Claim(context.Context, uuid.UUID, string, uuid.UUID, string) error
	Release(context.Context, uuid.UUID) error
}

type PodCloneClaimStore interface {
	Claim(context.Context, uuid.UUID, uuid.UUID, string, uuid.UUID) error
	Release(context.Context, uuid.UUID, uuid.UUID) error
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
	IsRouter    bool                           `json:"is_router,omitempty"`
	SegmentKey  *string                        `json:"segment_key,omitempty"`
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
	NetworkProfile  string                          `json:"network_profile_key"`
	VirtualMachines []publishedPodVMResponse        `json:"virtual_machines"`
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
	Number          int32                       `json:"number"`
	VNet            string                      `json:"vnet"`
	ExternalSubnet  string                      `json:"external_subnet"`
	ExternalGateway string                      `json:"external_gateway"`
	InternalSubnet  string                      `json:"internal_subnet"`
	InternalGateway string                      `json:"internal_gateway"`
	ProfileKey      string                      `json:"profile_key,omitempty"`
	DMZVNet         string                      `json:"dmz_vnet,omitempty"`
	DMZSubnet       string                      `json:"dmz_subnet,omitempty"`
	DMZGateway      string                      `json:"dmz_gateway,omitempty"`
	DMZVLANTag      int                         `json:"dmz_vlan_tag,omitempty"`
	LANVLANTag      int                         `json:"lan_vlan_tag,omitempty"`
	Segments        []podNetworkSegmentResponse `json:"segments,omitempty"`
	PrefixNAT       *prefixNATResponse          `json:"prefix_nat,omitempty"`
}

type podPowerResultResponse struct {
	Action    string                `json:"action"`
	Succeeded []uuid.UUID           `json:"succeeded"`
	Failed    []bulkVMActionFailure `json:"failed"`
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
	PowerResult *podPowerResultResponse              `json:"power_result,omitempty"`
}

type publishedPodBase struct {
	ID                uuid.UUID
	Title             string
	Slug              string
	Description       string
	ImageURL          string
	Status            database.PublishedPodStatus
	SourceFolderID    uuid.UUID
	NetworkProfileKey string
	CloneCount        int32
	CreatedAt         *time.Time
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
