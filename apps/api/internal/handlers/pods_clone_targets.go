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
	Key                      string
	Label                    string
	LANVNet                  string
	DMZVNet                  string
	WANBridge                string
	WANIPBase                string
	CloudInitStorage         string
	CloudInitUserFilePattern string
	CloudInitNetworkFile     string
	LANDMZUserFilePattern    string
	LANDMZNetworkFile        string
	IsDefault                bool
}

// Network is the subset the profile catalog resolves attachments against.
func (t podCloneTarget) Network() podnetwork.Target {
	return podnetwork.Target{
		Key:       t.Key,
		LANVNet:   t.LANVNet,
		DMZVNet:   t.DMZVNet,
		WANBridge: t.WANBridge,
		WANIPBase: t.WANIPBase,
	}
}

func podCloneTargetFromRow(row database.PodCloneTargets) podCloneTarget {
	return podCloneTarget{
		Key:                      row.Key,
		Label:                    row.Label,
		LANVNet:                  row.LanVnet,
		DMZVNet:                  row.DmzVnet,
		WANBridge:                row.WanBridge,
		WANIPBase:                row.WanIpBase,
		CloudInitStorage:         row.CloudInitStorage,
		CloudInitUserFilePattern: row.CloudInitUserFilePattern,
		CloudInitNetworkFile:     row.CloudInitNetworkFile,
		LANDMZUserFilePattern:    row.LanDmzUserFilePattern,
		LANDMZNetworkFile:        row.LanDmzNetworkFile,
		IsDefault:                row.IsDefault,
	}
}

type podCloneTargetResponse struct {
	Key                      string `json:"key"`
	Label                    string `json:"label"`
	LANVNet                  string `json:"lan_vnet"`
	DMZVNet                  string `json:"dmz_vnet"`
	WANBridge                string `json:"wan_bridge"`
	WANIPBase                string `json:"wan_ip_base"`
	CloudInitStorage         string `json:"cloud_init_storage"`
	CloudInitUserFilePattern string `json:"cloud_init_user_file_pattern"`
	CloudInitNetworkFile     string `json:"cloud_init_network_file"`
	LANDMZUserFilePattern    string `json:"lan_dmz_user_file_pattern"`
	LANDMZNetworkFile        string `json:"lan_dmz_network_file"`
	IsDefault                bool   `json:"is_default"`
}

func toPodCloneTargetResponse(target podCloneTarget) podCloneTargetResponse {
	return podCloneTargetResponse{
		Key:                      target.Key,
		Label:                    target.Label,
		LANVNet:                  target.LANVNet,
		DMZVNet:                  target.DMZVNet,
		WANBridge:                target.WANBridge,
		WANIPBase:                target.WANIPBase,
		CloudInitStorage:         target.CloudInitStorage,
		CloudInitUserFilePattern: target.CloudInitUserFilePattern,
		CloudInitNetworkFile:     target.CloudInitNetworkFile,
		LANDMZUserFilePattern:    target.LANDMZUserFilePattern,
		LANDMZNetworkFile:        target.LANDMZNetworkFile,
		IsDefault:                target.IsDefault,
	}
}

type podCloneTargetRequest struct {
	Key                      string `json:"key"`
	Label                    string `json:"label"`
	LANVNet                  string `json:"lan_vnet"`
	DMZVNet                  string `json:"dmz_vnet"`
	WANBridge                string `json:"wan_bridge"`
	WANIPBase                string `json:"wan_ip_base"`
	CloudInitStorage         string `json:"cloud_init_storage"`
	CloudInitUserFilePattern string `json:"cloud_init_user_file_pattern"`
	CloudInitNetworkFile     string `json:"cloud_init_network_file"`
	LANDMZUserFilePattern    string `json:"lan_dmz_user_file_pattern"`
	LANDMZNetworkFile        string `json:"lan_dmz_network_file"`
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

// The WAN IP base is descriptive only; the addresses come from the snippets.
func normalizePodCloneTargetRequest(req podCloneTargetRequest, requireKey bool) (podCloneTarget, *requestError) {
	invalid := func(message string) *requestError {
		return &requestError{Status: http.StatusUnprocessableEntity, UserMessage: message}
	}

	target := podCloneTarget{
		Key:              strings.TrimSpace(req.Key),
		Label:            strings.TrimSpace(req.Label),
		LANVNet:          strings.TrimSpace(req.LANVNet),
		DMZVNet:          strings.TrimSpace(req.DMZVNet),
		WANBridge:        strings.TrimSpace(req.WANBridge),
		CloudInitStorage: routerconfig.NormalizeCloudInitStorage(req.CloudInitStorage),
	}

	if requireKey {
		if target.Key == "" || len(target.Key) > 32 || !podCloneTargetKeyPattern.MatchString(target.Key) {
			return podCloneTarget{}, invalid("key must be lowercase letters, numbers, and single dashes (max 32 characters)")
		}
	}
	if target.Label == "" || len(target.Label) > 48 {
		return podCloneTarget{}, invalid("label must be between 1 and 48 characters")
	}
	if err := validateVNetID(target.LANVNet); err != nil {
		return podCloneTarget{}, invalid("LAN VNet: " + err.Error())
	}
	if err := validateVNetID(target.DMZVNet); err != nil {
		return podCloneTarget{}, invalid("DMZ VNet: " + err.Error())
	}
	if target.LANVNet == target.DMZVNet {
		return podCloneTarget{}, invalid("LAN and DMZ VNets must be distinct")
	}
	if target.WANBridge == "" {
		return podCloneTarget{}, invalid("WAN bridge is required")
	}
	if target.CloudInitStorage == "" {
		return podCloneTarget{}, invalid("cloud-init storage is required")
	}

	wanIPBase, err := routerconfig.NormalizeDottedPrefix(req.WANIPBase)
	if err != nil {
		return podCloneTarget{}, invalid("WAN IP base " + err.Error())
	}
	if wanIPBase == "" {
		return podCloneTarget{}, invalid("WAN IP base is required")
	}
	if strings.Count(wanIPBase, ".") != 2 {
		return podCloneTarget{}, invalid("WAN IP base must be the first two octets, for example 172.16.")
	}
	target.WANIPBase = wanIPBase

	patterns := []struct {
		label string
		value string
		dest  *string
	}{
		{"LAN router cloud-init user-data pattern", req.CloudInitUserFilePattern, &target.CloudInitUserFilePattern},
		{"LAN + DMZ router cloud-init user-data pattern", req.LANDMZUserFilePattern, &target.LANDMZUserFilePattern},
	}
	for _, pattern := range patterns {
		normalized, err := routerconfig.NormalizeCloudInitFilePattern(pattern.label, pattern.value)
		if err != nil {
			return podCloneTarget{}, invalid(err.Error())
		}
		*pattern.dest = normalized
	}

	files := []struct {
		label string
		value string
		dest  *string
	}{
		{"LAN router cloud-init network-config file", req.CloudInitNetworkFile, &target.CloudInitNetworkFile},
		{"LAN + DMZ router cloud-init network-config file", req.LANDMZNetworkFile, &target.LANDMZNetworkFile},
	}
	for _, file := range files {
		normalized, err := routerconfig.NormalizeCloudInitFileName(file.label, file.value)
		if err != nil {
			return podCloneTarget{}, invalid(err.Error())
		}
		*file.dest = normalized
	}

	return target, nil
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

	row, err := database.New(h.DB).CreatePodCloneTarget(c.Request.Context(), database.CreatePodCloneTargetParams{
		Key:                      target.Key,
		Label:                    target.Label,
		LanVnet:                  target.LANVNet,
		DmzVnet:                  target.DMZVNet,
		WanBridge:                target.WANBridge,
		WanIpBase:                target.WANIPBase,
		CloudInitStorage:         target.CloudInitStorage,
		CloudInitUserFilePattern: target.CloudInitUserFilePattern,
		CloudInitNetworkFile:     target.CloudInitNetworkFile,
		LanDmzUserFilePattern:    target.LANDMZUserFilePattern,
		LanDmzNetworkFile:        target.LANDMZNetworkFile,
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
	if reqErr := h.ensureCloneTargetVNetsValid(c.Request.Context(), target); reqErr != nil {
		writeRequestError(c, reqErr)
		return
	}

	row, err := database.New(h.DB).UpdatePodCloneTarget(c.Request.Context(), database.UpdatePodCloneTargetParams{
		Key:                      key,
		Label:                    target.Label,
		LanVnet:                  target.LANVNet,
		DmzVnet:                  target.DMZVNet,
		WanBridge:                target.WANBridge,
		WanIpBase:                target.WANIPBase,
		CloudInitStorage:         target.CloudInitStorage,
		CloudInitUserFilePattern: target.CloudInitUserFilePattern,
		CloudInitNetworkFile:     target.CloudInitNetworkFile,
		LanDmzUserFilePattern:    target.LANDMZUserFilePattern,
		LanDmzNetworkFile:        target.LANDMZNetworkFile,
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
	if total := references.PublishedPodCount + references.ClonedPodCount + references.AllocationCount; total > 0 {
		writeConflict(c, fmt.Sprintf(
			"pod clone target %q is still used by %d published pod(s), %d clone(s), and %d network allocation(s)",
			key, references.PublishedPodCount, references.ClonedPodCount, references.AllocationCount,
		))
		return
	}

	deleted, err := q.DeletePodCloneTarget(c.Request.Context(), key)
	if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to delete pod clone target", "delete pod clone target", err)
		return
	}
	if deleted == 0 {
		writeConflict(c, "pod clone target not found, or is the default target")
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
