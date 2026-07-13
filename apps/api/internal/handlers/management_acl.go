package handlers

import (
	"errors"
	"net/http"

	"github.com/MaxwellCaron/kamino/internal/audit"
	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type AuthorizationHandler struct {
	Authz *authorization.Service
	Audit *audit.Service
}

type updateManagementACLRequest struct {
	Grants []authorization.ManagementPermission `json:"grants"`
}

type managementPermissionDefinitionResponse struct {
	BootstrapOnly bool                               `json:"bootstrap_only"`
	Dangerous     bool                               `json:"dangerous"`
	Description   string                             `json:"description"`
	Key           authorization.ManagementPermission `json:"key"`
	Label         string                             `json:"label"`
}

type managementPermissionSectionResponse struct {
	Key         string                                   `json:"key"`
	Label       string                                   `json:"label"`
	Permissions []managementPermissionDefinitionResponse `json:"permissions"`
}

type managementACLResponse struct {
	CanEditBootstrapOnly bool                                  `json:"can_edit_bootstrap_only"`
	EffectiveGrants      []authorization.ManagementPermission  `json:"effective_grants"`
	Grants               []authorization.ManagementPermission  `json:"grants"`
	GroupID              uuid.UUID                             `json:"group_id"`
	Immutable            bool                                  `json:"immutable"`
	Sections             []managementPermissionSectionResponse `json:"sections"`
}

func (h *AuthorizationHandler) GetManagementACLForGroup(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		writeUnauthorized(c)
		return
	}

	if !requireManagementPermission(c, h.Authz, principalID, authorization.ManagementPermissionAdministrator) {
		return
	}

	groupID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		writeInvalidRequest(c, "invalid group id")
		return
	}

	permissions, err := h.Authz.GetManagementPermissionsForGroup(
		c.Request.Context(),
		principalID,
		groupID,
	)
	switch {
	case err == nil:
	case errors.Is(err, pgx.ErrNoRows):
		c.JSON(http.StatusNotFound, gin.H{"error": "group not found"})
		return
	case authorization.IsManagementACLRequiresGroup(err):
		writeInvalidRequest(c, "management access only applies to groups")
		return
	default:
		writeLoggedError(c, http.StatusInternalServerError, "failed to fetch management access", "get management acl for group", err)
		return
	}

	c.JSON(http.StatusOK, managementACLResponse{
		CanEditBootstrapOnly: permissions.CanEditBootstrapOnly,
		EffectiveGrants:      permissions.EffectiveGrants,
		Grants:               permissions.Grants,
		GroupID:              groupID,
		Immutable:            permissions.Immutable,
		Sections:             managementPermissionSectionsResponse(),
	})
}

func (h *AuthorizationHandler) UpdateManagementACLForGroup(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		writeUnauthorized(c)
		return
	}

	if !requireManagementPermission(c, h.Authz, principalID, authorization.ManagementPermissionAdministrator) {
		return
	}

	groupID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		writeInvalidRequest(c, "invalid group id")
		return
	}

	var req updateManagementACLRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeInvalidRequest(c, "invalid request body")
		return
	}

	err = h.Authz.SetManagementPermissionsForGroup(
		c.Request.Context(),
		principalID,
		groupID,
		req.Grants,
	)
	switch {
	case err == nil:
	case authorization.IsForbidden(err):
		writeForbidden(c)
		return
	case errors.Is(err, pgx.ErrNoRows):
		c.JSON(http.StatusNotFound, gin.H{"error": "group not found"})
		return
	case authorization.IsManagementACLRequiresGroup(err):
		writeInvalidRequest(c, "management access only applies to groups")
		return
	default:
		writeLoggedError(c, http.StatusBadRequest, "failed to update management access", "update management acl for group", err)
		return
	}

	grantKeys := make([]string, 0, len(req.Grants))
	for _, g := range req.Grants {
		grantKeys = append(grantKeys, string(g))
	}
	h.Audit.RecordSuccess(c.Request.Context(), audit.EventParams{
		ActorPrincipalID: &principalID,
		ActionKind:       "management_acl.update",
		TargetKind:       "principal",
		Metadata: map[string]any{
			"group_id": groupID.String(),
			"grants":   grantKeys,
		},
	})
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func managementPermissionSectionsResponse() []managementPermissionSectionResponse {
	catalog := authorization.ManagementPermissionCatalog()
	sections := make([]managementPermissionSectionResponse, 0, len(catalog))
	sectionIndexByKey := make(map[string]int, len(catalog))

	for _, definition := range catalog {
		index, ok := sectionIndexByKey[definition.SectionKey]
		if !ok {
			index = len(sections)
			sectionIndexByKey[definition.SectionKey] = index
			sections = append(sections, managementPermissionSectionResponse{
				Key:         definition.SectionKey,
				Label:       definition.SectionLabel,
				Permissions: make([]managementPermissionDefinitionResponse, 0),
			})
		}

		sections[index].Permissions = append(
			sections[index].Permissions,
			managementPermissionDefinitionResponse{
				BootstrapOnly: definition.BootstrapOnly,
				Dangerous:     definition.Dangerous,
				Description:   definition.Description,
				Key:           definition.Key,
				Label:         definition.Label,
			},
		)
	}

	return sections
}
