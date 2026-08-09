package handlers

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"strings"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/audit"
	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/MaxwellCaron/kamino/internal/podnetwork"
	"github.com/MaxwellCaron/kamino/internal/routerconfig"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}

var podCloneTargetKeyPattern = regexp.MustCompile(`^[a-z0-9]+(-[a-z0-9]+)*$`)

// podCloneTarget is one resolved clone domain, with its cloud-init snippets.
type podCloneTarget struct {
	Key               string
	Label             string
	NetworkProfileKey string
	LANVNet           string
	DMZVNet           string
	WANBridge         string
	WANSubnet         string
	NetworkMin        int32
	NetworkMax        int32
	CloudInitStorage  string
	IsDefault         bool
	IsPersonal        bool
}

// Network is the subset the profile catalog resolves attachments against.
func (t podCloneTarget) Network() podnetwork.Target {
	return podnetwork.Target{
		Key:       t.Key,
		LANVNet:   t.LANVNet,
		DMZVNet:   t.DMZVNet,
		WANBridge: t.WANBridge,
		WANSubnet: t.WANSubnet,
	}
}

func podCloneTargetFromRow(row database.PodCloneTargets) podCloneTarget {
	return podCloneTarget{
		Key:               row.Key,
		Label:             row.Label,
		NetworkProfileKey: row.NetworkProfileKey,
		LANVNet:           row.LanVnet,
		DMZVNet:           derefString(row.DmzVnet),
		WANBridge:         row.WanBridge,
		WANSubnet:         row.WanSubnet,
		NetworkMin:        row.NetworkMin,
		NetworkMax:        row.NetworkMax,
		CloudInitStorage:  row.CloudInitStorage,
		IsDefault:         row.IsDefault,
		IsPersonal:        row.IsPersonal,
	}
}

func podCloneTargetIdentityChanged(current, next podCloneTarget) bool {
	return current.NetworkProfileKey != next.NetworkProfileKey ||
		current.LANVNet != next.LANVNet ||
		current.DMZVNet != next.DMZVNet ||
		current.WANBridge != next.WANBridge ||
		current.WANSubnet != next.WANSubnet ||
		current.CloudInitStorage != next.CloudInitStorage
}

func podCloneTargetReferenceCount(references database.CountPodCloneTargetReferencesRow) int64 {
	return references.PublishedPodCount + references.ClonedPodCount +
		references.AllocationCount + references.PersonalPodCount
}

func derefString(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

// nilIfEmpty maps a LAN-only target's absent DMZ columns back to NULL.
func nilIfEmpty(value string) *string {
	if value == "" {
		return nil
	}
	return &value
}

// Snippet filenames are derived from the immutable key, so targets can never
// collide on the storage and operators never name them by hand.
func (t podCloneTarget) snippetPrefix() string {
	return "kamino-" + t.Key + "-router"
}

func (t podCloneTarget) CloudInitUserFilePattern() string {
	return t.snippetPrefix() + "-{network}-user-data.yaml"
}

func (t podCloneTarget) CloudInitNetworkFile() string {
	return t.snippetPrefix() + "-network-config.yaml"
}

func (t podCloneTarget) LANDMZUserFilePattern() string {
	return t.snippetPrefix() + "-lan-dmz-{network}-user-data.yaml"
}

func (t podCloneTarget) LANDMZNetworkFile() string {
	return t.snippetPrefix() + "-lan-dmz-network-config.yaml"
}

// SupportsProfile reports whether a pod using profileKey can clone onto this
// target. A LAN + DMZ target has both VNets, so it also serves LAN-only pods.
func (t podCloneTarget) SupportsProfile(profileKey string) bool {
	if t.NetworkProfileKey == podnetwork.ProfileLANDMZRouterV1 {
		return true
	}
	return profileKey == podnetwork.ProfileLANRouterV1
}

type podCloneTargetResponse struct {
	Key                      string `json:"key"`
	Label                    string `json:"label"`
	NetworkProfileKey        string `json:"network_profile_key"`
	LANVNet                  string `json:"lan_vnet"`
	DMZVNet                  string `json:"dmz_vnet"`
	WANBridge                string `json:"wan_bridge"`
	WANSubnet                string `json:"wan_subnet"`
	NetworkMin               int32  `json:"network_min"`
	NetworkMax               int32  `json:"network_max"`
	CloudInitStorage         string `json:"cloud_init_storage"`
	CloudInitUserFilePattern string `json:"cloud_init_user_file_pattern"`
	CloudInitNetworkFile     string `json:"cloud_init_network_file"`
	LANDMZUserFilePattern    string `json:"lan_dmz_user_file_pattern,omitempty"`
	LANDMZNetworkFile        string `json:"lan_dmz_network_file,omitempty"`
	IsDefault                bool   `json:"is_default"`
	IsPersonal               bool   `json:"is_personal"`
}

func toPodCloneTargetResponse(target podCloneTarget) podCloneTargetResponse {
	return podCloneTargetResponse{
		Key:                      target.Key,
		Label:                    target.Label,
		NetworkProfileKey:        target.NetworkProfileKey,
		LANVNet:                  target.LANVNet,
		DMZVNet:                  target.DMZVNet,
		WANBridge:                target.WANBridge,
		WANSubnet:                target.WANSubnet,
		NetworkMin:               target.NetworkMin,
		NetworkMax:               target.NetworkMax,
		CloudInitStorage:         target.CloudInitStorage,
		CloudInitUserFilePattern: target.CloudInitUserFilePattern(),
		CloudInitNetworkFile:     target.CloudInitNetworkFile(),
		IsDefault:                target.IsDefault,
		IsPersonal:               target.IsPersonal,
	}
}

type podCloneTargetRequest struct {
	Key               string `json:"key"`
	Label             string `json:"label"`
	NetworkProfileKey string `json:"network_profile_key"`
	LANVNet           string `json:"lan_vnet"`
	DMZVNet           string `json:"dmz_vnet"`
	WANBridge         string `json:"wan_bridge"`
	WANSubnet         string `json:"wan_subnet"`
	NetworkMin        int32  `json:"network_min"`
	NetworkMax        int32  `json:"network_max"`
	CloudInitStorage  string `json:"cloud_init_storage"`
	IsDefault         bool   `json:"is_default"`
	IsPersonal        bool   `json:"is_personal"`
}

func (h *PodsHandler) resolvePodCloneTarget(ctx context.Context, key string) (podCloneTarget, *requestError) {
	key = strings.TrimSpace(key)
	if key == "" {
		return h.defaultPodCloneTarget(ctx)
	}

	row, err := database.New(h.DB).GetPodCloneTarget(ctx, key)
	if errors.Is(err, pgx.ErrNoRows) {
		return podCloneTarget{}, &requestError{
			Status:      http.StatusUnprocessableEntity,
			UserMessage: fmt.Sprintf("pod clone target %q does not exist", key),
		}
	}
	if err != nil {
		return podCloneTarget{}, &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "failed to load pod clone target",
			Operation:   "load pod clone target",
			Err:         err,
		}
	}
	return podCloneTargetFromRow(row), nil
}

func (h *PodsHandler) defaultPodCloneTarget(ctx context.Context) (podCloneTarget, *requestError) {
	row, err := database.New(h.DB).GetDefaultPodCloneTarget(ctx)
	if errors.Is(err, pgx.ErrNoRows) {
		return podCloneTarget{}, &requestError{
			Status:      http.StatusServiceUnavailable,
			UserMessage: "no default pod clone target is configured",
		}
	}
	if err != nil {
		return podCloneTarget{}, &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "failed to load pod clone target",
			Operation:   "load default pod clone target",
			Err:         err,
		}
	}
	return podCloneTargetFromRow(row), nil
}

func (h *PodsHandler) personalPodCloneTarget(ctx context.Context) (podCloneTarget, *requestError) {
	row, err := database.New(h.DB).GetPersonalPodCloneTarget(ctx)
	if errors.Is(err, pgx.ErrNoRows) {
		return podCloneTarget{}, &requestError{
			Status:      http.StatusServiceUnavailable,
			UserMessage: "no personal pod clone target is configured",
		}
	}
	if err != nil {
		return podCloneTarget{}, &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "failed to load personal pod clone target",
			Operation:   "load personal pod clone target",
			Err:         err,
		}
	}
	return podCloneTargetFromRow(row), nil
}

func (h *PodsHandler) listPodCloneTargets(ctx context.Context) ([]podCloneTarget, *requestError) {
	rows, err := database.New(h.DB).ListPodCloneTargets(ctx)
	if err != nil {
		return nil, &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "failed to load pod clone targets",
			Operation:   "list pod clone targets",
			Err:         err,
		}
	}
	targets := make([]podCloneTarget, 0, len(rows))
	for _, row := range rows {
		targets = append(targets, podCloneTargetFromRow(row))
	}
	return targets, nil
}

// podCloneTargetsByKey avoids resolving one target per row in a loop.
func (h *PodsHandler) podCloneTargetsByKey(ctx context.Context) (map[string]podCloneTarget, *requestError) {
	targets, reqErr := h.listPodCloneTargets(ctx)
	if reqErr != nil {
		return nil, reqErr
	}
	byKey := make(map[string]podCloneTarget, len(targets))
	for _, target := range targets {
		byKey[target.Key] = target
	}
	return byKey, nil
}

// The WAN subnet is descriptive only; the addresses come from the snippets.
func normalizePodCloneTargetRequest(req podCloneTargetRequest, requireKey bool) (podCloneTarget, *requestError) {
	invalid := func(message string) *requestError {
		return &requestError{Status: http.StatusUnprocessableEntity, UserMessage: message}
	}

	target := podCloneTarget{
		Key:               strings.TrimSpace(req.Key),
		Label:             strings.TrimSpace(req.Label),
		NetworkProfileKey: strings.TrimSpace(req.NetworkProfileKey),
		LANVNet:           strings.TrimSpace(req.LANVNet),
		DMZVNet:           strings.TrimSpace(req.DMZVNet),
		WANBridge:         strings.TrimSpace(req.WANBridge),
		NetworkMin:        req.NetworkMin,
		NetworkMax:        req.NetworkMax,
		CloudInitStorage:  routerconfig.NormalizeCloudInitStorage(req.CloudInitStorage),
		IsDefault:         req.IsDefault,
		IsPersonal:        req.IsPersonal,
	}

	if requireKey {
		if target.Key == "" || len(target.Key) > 32 || !podCloneTargetKeyPattern.MatchString(target.Key) {
			return podCloneTarget{}, invalid("key must be lowercase letters, numbers, and single dashes (max 32 characters)")
		}
	}
	if target.Label == "" || len(target.Label) > 48 {
		return podCloneTarget{}, invalid("label must be between 1 and 48 characters")
	}
	switch target.NetworkProfileKey {
	case podnetwork.ProfileLANRouterV1, podnetwork.ProfileLANDMZRouterV1:
	default:
		return podCloneTarget{}, invalid("network profile must be lan-router-v1 or lan-dmz-router-v1")
	}
	if err := validateVNetID(target.LANVNet); err != nil {
		return podCloneTarget{}, invalid("LAN VNet: " + err.Error())
	}
	if target.WANBridge == "" {
		return podCloneTarget{}, invalid("WAN bridge is required")
	}
	if target.CloudInitStorage == "" {
		return podCloneTarget{}, invalid("cloud-init storage is required")
	}
	if target.NetworkMin < 1 || target.NetworkMin > 254 ||
		target.NetworkMax < 1 || target.NetworkMax > 254 {
		return podCloneTarget{}, invalid("network numbers must be between 1 and 254")
	}
	if target.NetworkMin > target.NetworkMax {
		return podCloneTarget{}, invalid("network minimum must not exceed the maximum")
	}

	wantsDMZ := target.NetworkProfileKey == podnetwork.ProfileLANDMZRouterV1
	if wantsDMZ {
		if err := validateVNetID(target.DMZVNet); err != nil {
			return podCloneTarget{}, invalid("DMZ VNet: " + err.Error())
		}
		if target.LANVNet == target.DMZVNet {
			return podCloneTarget{}, invalid("LAN and DMZ VNets must be distinct")
		}
	} else if target.DMZVNet != "" {
		return podCloneTarget{}, invalid("a LAN Router target must not set a DMZ VNet")
	}

	wanSubnet, err := routerconfig.ParseIPv4Subnet16(req.WANSubnet)
	if err != nil {
		return podCloneTarget{}, invalid("WAN subnet " + err.Error())
	}
	target.WANSubnet = wanSubnet.String()

	return target, nil
}

func (h *PodsHandler) savePodCloneTarget(
	ctx context.Context,
	target podCloneTarget,
	write func(*database.Queries) (database.PodCloneTargets, error),
) (database.PodCloneTargets, error) {
	tx, err := h.DB.Begin(ctx)
	if err != nil {
		return database.PodCloneTargets{}, fmt.Errorf("begin clone target save: %w", err)
	}
	defer tx.Rollback(ctx)

	q := database.New(tx)
	if err := q.LockPodCloneTargetRoles(ctx); err != nil {
		return database.PodCloneTargets{}, fmt.Errorf("lock clone target roles: %w", err)
	}
	if target.IsDefault {
		if err := q.ClearDefaultPodCloneTarget(ctx); err != nil {
			return database.PodCloneTargets{}, fmt.Errorf("clear default clone target: %w", err)
		}
	}
	if target.IsPersonal {
		if err := q.ClearPersonalPodCloneTarget(ctx); err != nil {
			return database.PodCloneTargets{}, fmt.Errorf("clear personal clone target: %w", err)
		}
	}

	row, err := write(q)
	if err != nil {
		return database.PodCloneTargets{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return database.PodCloneTargets{}, fmt.Errorf("commit clone target save: %w", err)
	}
	return row, nil
}

func (h *PodsHandler) ListPodCloneTargets(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		writeUnauthorized(c)
		return
	}
	if !requireManagementPermission(c, h.Authz, principalID, authorization.ManagementPermissionManager) {
		return
	}

	targets, reqErr := h.listPodCloneTargets(c.Request.Context())
	if reqErr != nil {
		writeRequestError(c, reqErr)
		return
	}

	responses := make([]podCloneTargetResponse, 0, len(targets))
	for _, target := range targets {
		responses = append(responses, toPodCloneTargetResponse(target))
	}
	c.JSON(http.StatusOK, gin.H{"clone_targets": responses})
}

func (h *PodsHandler) CreatePodCloneTarget(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		writeUnauthorized(c)
		return
	}
	if !requireManagementPermission(c, h.Authz, principalID, authorization.ManagementPermissionAdministrator) {
		return
	}

	var req podCloneTargetRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeInvalidRequest(c, "invalid request body")
		return
	}

	target, reqErr := normalizePodCloneTargetRequest(req, true)
	if reqErr != nil {
		writeRequestError(c, reqErr)
		return
	}
	if reqErr := h.ensureCloneTargetVNetsValid(c.Request.Context(), target); reqErr != nil {
		writeRequestError(c, reqErr)
		return
	}

	row, err := h.savePodCloneTarget(c.Request.Context(), target, func(q *database.Queries) (database.PodCloneTargets, error) {
		return q.CreatePodCloneTarget(c.Request.Context(), database.CreatePodCloneTargetParams{
			Key:               target.Key,
			Label:             target.Label,
			NetworkProfileKey: target.NetworkProfileKey,
			LanVnet:           target.LANVNet,
			DmzVnet:           nilIfEmpty(target.DMZVNet),
			WanBridge:         target.WANBridge,
			WanSubnet:         target.WANSubnet,
			NetworkMin:        target.NetworkMin,
			NetworkMax:        target.NetworkMax,
			CloudInitStorage:  target.CloudInitStorage,
			IsDefault:         target.IsDefault,
			IsPersonal:        target.IsPersonal,
		})
	})
	if isUniqueViolation(err) {
		writeConflict(c, fmt.Sprintf("pod clone target %q already exists", target.Key))
		return
	}
	if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to create pod clone target", "create pod clone target", err)
		return
	}

	h.Audit.RecordSuccess(c.Request.Context(), audit.EventParams{
		ActorPrincipalID: &principalID,
		ActionKind:       "pod.clone_target.create",
		TargetKind:       "pod_clone_target",
		Metadata:         map[string]any{"key": target.Key},
	})
	c.JSON(http.StatusCreated, toPodCloneTargetResponse(podCloneTargetFromRow(row)))
}

func (h *PodsHandler) UpdatePodCloneTarget(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		writeUnauthorized(c)
		return
	}
	if !requireManagementPermission(c, h.Authz, principalID, authorization.ManagementPermissionAdministrator) {
		return
	}

	key := strings.TrimSpace(c.Param("key"))
	if key == "" {
		writeInvalidRequest(c, "invalid pod clone target key")
		return
	}

	var req podCloneTargetRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeInvalidRequest(c, "invalid request body")
		return
	}

	target, reqErr := normalizePodCloneTargetRequest(req, false)
	if reqErr != nil {
		writeRequestError(c, reqErr)
		return
	}
	target.Key = key
	q := database.New(h.DB)
	currentRow, err := q.GetPodCloneTarget(c.Request.Context(), key)
	if errors.Is(err, pgx.ErrNoRows) {
		c.JSON(http.StatusNotFound, gin.H{"error": "pod clone target not found"})
		return
	}
	if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to load pod clone target", "load pod clone target for update", err)
		return
	}
	if podCloneTargetIdentityChanged(podCloneTargetFromRow(currentRow), target) {
		references, err := q.CountPodCloneTargetReferences(c.Request.Context(), key)
		if err != nil {
			writeLoggedError(c, http.StatusInternalServerError, "failed to check pod clone target usage", "count pod clone target references for update", err)
			return
		}
		if podCloneTargetReferenceCount(references) > 0 {
			writeConflict(c, "network settings cannot be changed while this clone target is in use; create a new target and assign it to the published pod instead")
			return
		}
	}
	if reqErr := h.ensureCloneTargetVNetsValid(c.Request.Context(), target); reqErr != nil {
		writeRequestError(c, reqErr)
		return
	}

	row, err := h.savePodCloneTarget(c.Request.Context(), target, func(q *database.Queries) (database.PodCloneTargets, error) {
		return q.UpdatePodCloneTarget(c.Request.Context(), database.UpdatePodCloneTargetParams{
			Key:               key,
			Label:             target.Label,
			NetworkProfileKey: target.NetworkProfileKey,
			LanVnet:           target.LANVNet,
			DmzVnet:           nilIfEmpty(target.DMZVNet),
			WanBridge:         target.WANBridge,
			WanSubnet:         target.WANSubnet,
			NetworkMin:        target.NetworkMin,
			NetworkMax:        target.NetworkMax,
			CloudInitStorage:  target.CloudInitStorage,
			IsDefault:         target.IsDefault,
			IsPersonal:        target.IsPersonal,
		})
	})
	if errors.Is(err, pgx.ErrNoRows) {
		c.JSON(http.StatusNotFound, gin.H{"error": "pod clone target not found"})
		return
	}
	if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to update pod clone target", "update pod clone target", err)
		return
	}

	h.Audit.RecordSuccess(c.Request.Context(), audit.EventParams{
		ActorPrincipalID: &principalID,
		ActionKind:       "pod.clone_target.update",
		TargetKind:       "pod_clone_target",
		Metadata:         map[string]any{"key": key},
	})
	c.JSON(http.StatusOK, toPodCloneTargetResponse(podCloneTargetFromRow(row)))
}

func (h *PodsHandler) DeletePodCloneTarget(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		writeUnauthorized(c)
		return
	}
	if !requireManagementPermission(c, h.Authz, principalID, authorization.ManagementPermissionAdministrator) {
		return
	}

	key := strings.TrimSpace(c.Param("key"))
	if key == "" {
		writeInvalidRequest(c, "invalid pod clone target key")
		return
	}

	q := database.New(h.DB)
	references, err := q.CountPodCloneTargetReferences(c.Request.Context(), key)
	if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to check pod clone target usage", "count pod clone target references", err)
		return
	}
	if total := references.PublishedPodCount + references.ClonedPodCount +
		references.AllocationCount + references.PersonalPodCount; total > 0 {
		writeConflict(c, fmt.Sprintf(
			"pod clone target %q is still used by %d published pod(s), %d clone(s), %d personal pod(s), and %d network allocation(s)",
			key, references.PublishedPodCount, references.ClonedPodCount,
			references.PersonalPodCount, references.AllocationCount,
		))
		return
	}

	deleted, err := q.DeletePodCloneTarget(c.Request.Context(), key)
	if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to delete pod clone target", "delete pod clone target", err)
		return
	}
	if deleted == 0 {
		writeConflict(c, "pod clone target not found, or is assigned as the default or personal target")
		return
	}

	h.Audit.RecordSuccess(c.Request.Context(), audit.EventParams{
		ActorPrincipalID: &principalID,
		ActionKind:       "pod.clone_target.delete",
		TargetKind:       "pod_clone_target",
		Metadata:         map[string]any{"key": key},
	})
	c.Status(http.StatusNoContent)
}
