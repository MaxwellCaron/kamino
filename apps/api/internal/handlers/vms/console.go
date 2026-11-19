package vms

import (
	"context"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/MaxwellCaron/kamino/internal/handlers/httpx"
	"github.com/MaxwellCaron/kamino/internal/handlers/vmaccess"
	"github.com/MaxwellCaron/kamino/internal/proxmox"
	"github.com/gin-gonic/gin"
)

type ConsoleHandler struct {
	PX             spiceProxyProxmox
	Authz          vmAuthz
	SPICEProxyHost string
}

type spiceProxyProxmox interface {
	vmProxmox
	CreateSPICEProxy(
		ctx context.Context,
		gt proxmox.GuestType,
		node string,
		vmid int,
		proxyHost string,
	) (*proxmox.SPICEProxyResponse, error)
}

func renderVirtViewerConfig(resp *proxmox.SPICEProxyResponse) (string, error) {
	if resp == nil {
		return "", fmt.Errorf("missing SPICE proxy response")
	}

	fields := []struct {
		key   string
		value string
	}{
		{"type", resp.Type},
		{"title", resp.Title},
		{"host", resp.Host},
		{"proxy", resp.Proxy},
		{"tls-port", strconv.Itoa(resp.TLSPort)},
		{"host-subject", resp.HostSubject},
		{"ca", resp.CA},
		{"password", resp.Password},
		{"delete-this-file", "1"},
		{"secure-attention", resp.SecureAttention},
		{"toggle-fullscreen", resp.ToggleFullscreen},
		{"release-cursor", resp.ReleaseCursor},
	}

	lines := make([]string, 0, len(fields)+1)
	lines = append(lines, "[virt-viewer]")
	for _, field := range fields {
		if strings.ContainsAny(field.value, "\r\n") {
			return "", fmt.Errorf("invalid %s value", field.key)
		}
		lines = append(lines, field.key+"="+field.value)
	}

	return strings.Join(lines, "\n") + "\n", nil
}

func (h *ConsoleHandler) DownloadSPICEConfig(c *gin.Context) {
	principalID, ok := httpx.CurrentPrincipalID(c)
	if !ok {
		httpx.WriteUnauthorized(c)
		return
	}

	itemID, ok := httpx.ParseItemIDParam(c)
	if !ok {
		return
	}

	target, ok := vmaccess.RequireVerifiedVMItemPermission(
		c, h.Authz, h.PX, principalID, itemID, authorization.ConsoleVM, false,
	)
	if !ok {
		return
	}

	spiceResp, err := h.PX.CreateSPICEProxy(
		c.Request.Context(),
		target.GuestType,
		target.Node,
		target.VMID,
		h.SPICEProxyHost,
	)
	if err != nil {
		httpx.WriteLoggedError(c, http.StatusBadGateway, "failed to create SPICE configuration", "create spice proxy", err)
		return
	}

	body, err := renderVirtViewerConfig(spiceResp)
	if err != nil {
		httpx.WriteLoggedError(c, http.StatusBadGateway, "failed to create SPICE configuration", "render spice config", err)
		return
	}

	c.Header("Content-Type", "application/x-virt-viewer; charset=utf-8")
	c.Header("Content-Disposition", `attachment; filename="kamino-spice.vv"`)
	c.Header("Cache-Control", "no-store, private")
	c.Header("Pragma", "no-cache")
	c.Header("X-Content-Type-Options", "nosniff")
	c.Data(http.StatusOK, "application/x-virt-viewer; charset=utf-8", []byte(body))
}
