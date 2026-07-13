package handlers

import (
	"errors"
	"net/http"
	"strings"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/authorization"
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
