package handlers

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/podnetwork"
	"github.com/MaxwellCaron/kamino/internal/proxmox"
	"github.com/MaxwellCaron/kamino/internal/vmactions"
	"github.com/google/uuid"
)

func TestClonedPodVNetName(t *testing.T) {
	handler := &PodsHandler{
		RouterCloneConfig: PodRouterCloneConfig{
			VNetPrefix: "pod",
		},
	}
	if got := handler.clonedPodVNetName(17); got != "pod17" {
		t.Fatalf("clonedPodVNetName() = %q, want %q", got, "pod17")
	}

	handler.RouterCloneConfig.VNetPrefix = "  lab- "
	if got := handler.clonedPodVNetName(17); got != "lab-17" {
		t.Fatalf("clonedPodVNetName() trimmed prefix = %q, want %q", got, "lab-17")
	}
}

func TestConfigurePersonalPodNetworkAttachmentsSetsWANAndLANBridges(t *testing.T) {
	var net0Payload string
	var net1Payload string

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/api2/json/cluster/sdn/vnets":
			writeProxmoxAPIResponse(t, w, http.StatusOK, []proxmox.VNet{{VNet: "prsn4001"}})
		case r.Method == http.MethodGet && r.URL.Path == "/api2/json/nodes/node1/qemu/101/config":
			writeProxmoxAPIResponse(t, w, http.StatusOK, map[string]any{
				"scsi0": "local-lvm:vm-101-disk-0,size=10G",
				"net0":  "virtio=AA:BB:CC:DD:EE:FF,bridge=sharedwan",
				"net1":  "virtio=11:22:33:44:55:66,bridge=pod1",
			})
		case r.Method == http.MethodPut && r.URL.Path == "/api2/json/nodes/node1/qemu/101/config":
			if err := r.ParseForm(); err != nil {
				t.Fatalf("parse form: %v", err)
			}
			if value := r.PostForm.Get("net0"); value != "" {
				net0Payload = value
			}
			if value := r.PostForm.Get("net1"); value != "" {
				net1Payload = value
			}
			writeProxmoxAPIResponse(t, w, http.StatusOK, nil)
		default:
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
	}))
	defer server.Close()

	handler := &PodsHandler{PX: proxmox.NewHTTPTestClient(server)}
	reqErr := handler.configurePersonalPodNetworkAttachments(
		context.Background(),
		"personalwan",
		"prsn4001",
		[]podNetworkVMTarget{{
			name:   "router",
			router: true,
			clone: clonedVM{
				TargetNode: "node1",
				VMID:       101,
			},
		}},
	)
	if reqErr != nil {
		t.Fatalf("configurePersonalPodNetworkAttachments() error = %v", reqErr)
	}
	if !strings.Contains(net0Payload, "bridge=personalwan") {
		t.Fatalf("net0 payload = %q, want personal WAN bridge", net0Payload)
	}
	if !strings.Contains(net1Payload, "bridge=prsn4001") {
		t.Fatalf("net1 payload = %q, want personal LAN VNet", net1Payload)
	}
}

func TestClonedPodNetworkMetadata(t *testing.T) {
	catalog, err := podnetwork.NewCatalog(podnetwork.Config{
		VNetPrefix:    "pod",
		LANVLANBase:   0,
		DMZVNetPrefix: "dmz",
		DMZVLANBase:   1000,
		WANIPBase:     "172.16.",
	})
	if err != nil {
		t.Fatalf("NewCatalog() error = %v", err)
	}

	tests := []struct {
		name           string
		clone          database.ClonedPods
		wantVNet       string
		wantExtSubnet  string
		wantExtGateway string
	}{
		{"published clone", database.ClonedPods{NetworkNumber: 24, NetworkProfileKey: podnetwork.ProfileLANRouterV1}, "pod24", "172.16.24.0/24", "172.16.24.1"},
		{"development", database.ClonedPods{NetworkNumber: 245, NetworkProfileKey: podnetwork.ProfileLANRouterV1}, "pod245", "172.16.245.0/24", "172.16.245.1"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			handler := &PodsHandler{
				NetworkCatalog: catalog,
				RouterCloneConfig: PodRouterCloneConfig{
					VNetPrefix: "pod",
					WANIPBase:  "172.16.",
				},
			}

			got, err := handler.clonedPodNetworkMetadata(tt.clone)
			if err != nil {
				t.Fatalf("clonedPodNetworkMetadata() error = %v", err)
			}
			if got.Number != tt.clone.NetworkNumber || got.VNet != tt.wantVNet {
				t.Fatalf("metadata identity = %#v", got)
			}
			if got.ExternalSubnet != tt.wantExtSubnet || got.ExternalGateway != tt.wantExtGateway {
				t.Fatalf("external metadata = %#v", got)
			}
			if got.InternalSubnet != "192.168.1.0/24" {
				t.Fatalf("internal subnet = %q, want 192.168.1.0/24", got.InternalSubnet)
			}
			if got.InternalGateway != "192.168.1.1" {
				t.Fatalf("internal gateway = %q, want 192.168.1.1", got.InternalGateway)
			}
		})
	}
}

func TestBuildClonedRouterCloudInitConfig(t *testing.T) {
	config, err := buildClonedRouterCloudInitConfig(24, PodRouterCloneConfig{
		CloudInitStorage:         "local",
		CloudInitUserFilePattern: "kamino-router-{network}-user-data.yaml",
		CloudInitNetworkFile:     "kamino-router-network-config.yaml",
	})
	if err != nil {
		t.Fatalf("buildClonedRouterCloudInitConfig() error = %v", err)
	}
	if config.Storage != "local" {
		t.Fatalf("Storage = %q, want %q", config.Storage, "local")
	}
	if config.UserFile != "kamino-router-24-user-data.yaml" {
		t.Fatalf("UserFile = %q, want %q", config.UserFile, "kamino-router-24-user-data.yaml")
	}
	if config.NetworkFile != "kamino-router-network-config.yaml" {
		t.Fatalf("NetworkFile = %q, want %q", config.NetworkFile, "kamino-router-network-config.yaml")
	}
}

func TestBuildClonedRouterCloudInitConfigSupportsCustomPatterns(t *testing.T) {
	config, err := buildClonedRouterCloudInitConfig(24, PodRouterCloneConfig{
		CloudInitStorage:         "local-zfs",
		CloudInitUserFilePattern: "lab-router-{network}-userdata.yml",
		CloudInitNetworkFile:     "lab-router-network.yml",
	})
	if err != nil {
		t.Fatalf("buildClonedRouterCloudInitConfig() error = %v", err)
	}
	if config.Storage != "local-zfs" {
		t.Fatalf("Storage = %q, want %q", config.Storage, "local-zfs")
	}
	if config.UserFile != "lab-router-24-userdata.yml" {
		t.Fatalf("UserFile = %q, want %q", config.UserFile, "lab-router-24-userdata.yml")
	}
	if config.NetworkFile != "lab-router-network.yml" {
		t.Fatalf("NetworkFile = %q, want %q", config.NetworkFile, "lab-router-network.yml")
	}
}

func TestBuildClonedRouterCloudInitConfigRejectsInvalidPatterns(t *testing.T) {
	_, err := buildClonedRouterCloudInitConfig(24, PodRouterCloneConfig{
		CloudInitStorage:         "local",
		CloudInitUserFilePattern: "kamino-router-user-data.yaml",
		CloudInitNetworkFile:     "kamino-router-network-config.yaml",
	})
	if err == nil {
		t.Fatalf("expected invalid user-data pattern error")
	}
	if !strings.Contains(err.Error(), "pattern must contain {network} exactly once") {
		t.Fatalf("unexpected error: %v", err)
	}

	_, err = buildClonedRouterCloudInitConfig(24, PodRouterCloneConfig{
		CloudInitStorage:         "local",
		CloudInitUserFilePattern: "kamino-router-{network}-user-data.yaml",
		CloudInitNetworkFile:     "kamino-router-{network}-network-config.yaml",
	})
	if err == nil {
		t.Fatalf("expected invalid network-config filename error")
	}
	if !strings.Contains(err.Error(), "must not contain {network}") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestIsPublishedPodRouterVM(t *testing.T) {
	if !isPublishedPodRouterVM(database.ListPublishedPodVMsForCloneRow{IsRouter: true, Name: "workstation"}) {
		t.Fatal("expected is_router=true to identify router")
	}
	if isPublishedPodRouterVM(database.ListPublishedPodVMsForCloneRow{Name: "router"}) {
		t.Fatal("expected workload named router without is_router to remain a workload")
	}
}

func TestPublishedPodVMTemplateItemID(t *testing.T) {
	publishedTemplateID := uuid.New()
	routerTemplateID := uuid.New()

	t.Run("router uses configured source template", func(t *testing.T) {
		got, err := publishedPodVMTemplateItemID(database.ListPublishedPodVMsForCloneRow{
			IsRouter:              true,
			SourceInventoryItemID: publishedTemplateID,
		}, routerTemplateID)
		if err != nil {
			t.Fatalf("publishedPodVMTemplateItemID() error = %v", err)
		}
		if got != routerTemplateID {
			t.Fatalf("template ID = %s, want %s", got, routerTemplateID)
		}
	})

	t.Run("non-router uses published template", func(t *testing.T) {
		got, err := publishedPodVMTemplateItemID(database.ListPublishedPodVMsForCloneRow{
			SourceInventoryItemID: publishedTemplateID,
		}, routerTemplateID)
		if err != nil {
			t.Fatalf("publishedPodVMTemplateItemID() error = %v", err)
		}
		if got != publishedTemplateID {
			t.Fatalf("template ID = %s, want %s", got, publishedTemplateID)
		}
	})

	t.Run("router requires configured template", func(t *testing.T) {
		if _, err := publishedPodVMTemplateItemID(database.ListPublishedPodVMsForCloneRow{IsRouter: true}, uuid.Nil); err == nil {
			t.Fatal("expected missing router template error")
		}
	})
}

func TestPodNetworkTargetsFromCloneResults(t *testing.T) {
	results := []clonePublishedVMResult{
		{
			published: database.ListPublishedPodVMsForCloneRow{Name: "router"},
			clone:     clonedVM{VMID: 100},
			router:    true,
		},
		{
			published: database.ListPublishedPodVMsForCloneRow{Name: "workstation"},
			clone:     clonedVM{VMID: 101},
			router:    false,
		},
	}
	targets := podNetworkTargetsFromCloneResults(results)
	if len(targets) != 2 {
		t.Fatalf("len = %d, want 2", len(targets))
	}
	if targets[0].name != "router" || !targets[0].router {
		t.Errorf("target[0] = %+v", targets[0])
	}
	if targets[1].name != "workstation" || targets[1].router {
		t.Errorf("target[1] = %+v", targets[1])
	}
}

const (
	testRouterNode      = "node1"
	testRouterVMID      = 101
	testBlockedPowerVM  = 200
	routerStartUPID     = "UPID:node1:00000000:00000000:00000000:qmstart:101:user@pve:"
	blockedPowerStartUP = "UPID:node1:00000000:00000000:00000000:qmstart:200:user@pve:"
)

type routerCloudInitTestState struct {
	mu            sync.Mutex
	runtimeStatus string
	startPosts    int
}

func (s *routerCloudInitTestState) setRuntimeStatus(status string) {
	s.mu.Lock()
	s.runtimeStatus = status
	s.mu.Unlock()
}

func (s *routerCloudInitTestState) runtimeStatusValue() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.runtimeStatus
}

func (s *routerCloudInitTestState) recordStartPost() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.startPosts++
	return s.startPosts
}

func (s *routerCloudInitTestState) startPostCount() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.startPosts
}

func newRouterCloudInitTestHandler(
	client *proxmox.Client,
	executor *vmactions.Executor,
) *PodsHandler {
	return &PodsHandler{
		PX:      client,
		Actions: executor,
		RouterCloneConfig: PodRouterCloneConfig{
			RouterWaitTimeout: 3 * time.Second,
		},
	}
}

func testRouterCloudInitTargets() []podNetworkVMTarget {
	return []podNetworkVMTarget{{
		name:   "router",
		router: true,
		clone: clonedVM{
			InventoryItemID: uuid.New(),
			TargetNode:      testRouterNode,
			VMID:            testRouterVMID,
		},
	}}
}

func testRouterCloudInitConfig() *clonedRouterCloudInitConfig {
	return &clonedRouterCloudInitConfig{
		Storage:     "local",
		UserFile:    "kamino-router-24-user-data.yaml",
		NetworkFile: "kamino-router-network-config.yaml",
	}
}

func serveRouterCloudInitProxmox(
	t *testing.T,
	state *routerCloudInitTestState,
	powerSlotHeld chan struct{},
	releasePowerSlot <-chan struct{},
	routerStartObserved chan struct{},
	cloudInitDone chan struct{},
) *httptest.Server {
	t.Helper()

	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodGet &&
			r.URL.Path == "/api2/json/nodes/node1/qemu/101/status/current":
			writeProxmoxAPIResponse(t, w, http.StatusOK, map[string]any{
				"status": state.runtimeStatusValue(),
			})
		case r.Method == http.MethodGet &&
			r.URL.Path == "/api2/json/nodes/node1/qemu/101/config":
			writeProxmoxAPIResponse(t, w, http.StatusOK, map[string]any{
				"ide2": "local:cloudinit",
			})
		case r.Method == http.MethodPut &&
			r.URL.Path == "/api2/json/nodes/node1/qemu/101/config":
			if cloudInitDone != nil {
				select {
				case cloudInitDone <- struct{}{}:
				default:
				}
			}
			writeProxmoxAPIResponse(t, w, http.StatusOK, nil)
		case r.Method == http.MethodPost &&
			r.URL.Path == "/api2/json/nodes/node1/qemu/101/status/start":
			state.recordStartPost()
			state.setRuntimeStatus("running")
			if routerStartObserved != nil {
				select {
				case routerStartObserved <- struct{}{}:
				default:
				}
			}
			writeProxmoxAPIResponse(t, w, http.StatusOK, routerStartUPID)
		case r.Method == http.MethodGet &&
			r.URL.Path == "/api2/json/nodes/node1/tasks/"+routerStartUPID+"/status":
			writeProxmoxAPIResponse(t, w, http.StatusOK, proxmox.TaskStatus{
				Status:     "stopped",
				ExitStatus: "OK",
			})
		case r.Method == http.MethodPost &&
			r.URL.Path == "/api2/json/nodes/node1/qemu/200/status/start":
			writeProxmoxAPIResponse(t, w, http.StatusOK, blockedPowerStartUP)
		case r.Method == http.MethodGet &&
			r.URL.Path == "/api2/json/nodes/node1/tasks/"+blockedPowerStartUP+"/status":
			if powerSlotHeld != nil {
				select {
				case powerSlotHeld <- struct{}{}:
				default:
				}
				if releasePowerSlot != nil {
					<-releasePowerSlot
				}
			}
			writeProxmoxAPIResponse(t, w, http.StatusOK, proxmox.TaskStatus{
				Status:     "stopped",
				ExitStatus: "OK",
			})
		default:
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
	}))
}

func TestConfigurePodRouterCloudInitUsesSharedPowerConcurrency(t *testing.T) {
	state := &routerCloudInitTestState{runtimeStatus: "stopped"}
	powerSlotHeld := make(chan struct{}, 1)
	releasePowerSlot := make(chan struct{})
	routerStartObserved := make(chan struct{}, 1)
	cloudInitDone := make(chan struct{}, 1)

	server := serveRouterCloudInitProxmox(
		t,
		state,
		powerSlotHeld,
		releasePowerSlot,
		routerStartObserved,
		cloudInitDone,
	)
	defer server.Close()

	client := proxmox.NewHTTPTestClient(server)
	executor := vmactions.NewExecutor(
		client,
		nil,
		nil,
		vmactions.OperationConfig{Concurrency: 2},
		vmactions.PowerConfig{Concurrency: 1, TaskTimeout: time.Minute},
	)
	handler := newRouterCloudInitTestHandler(client, executor)

	blockerDone := make(chan error, 1)
	go func() {
		blockerDone <- executor.PowerAction(context.Background(), vmactions.Target{
			Node:      testRouterNode,
			VMID:      testBlockedPowerVM,
			GuestType: proxmox.GuestQEMU,
		}, vmactions.PowerActionStart)
	}()

	select {
	case <-powerSlotHeld:
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for blocked power task to hold the slot")
	}

	configDone := make(chan *requestError, 1)
	go func() {
		configDone <- handler.configurePodRouterCloudInit(
			context.Background(),
			testRouterCloudInitConfig(),
			testRouterCloudInitTargets(),
		)
	}()

	select {
	case <-cloudInitDone:
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for cloud-init configuration")
	}

	select {
	case <-routerStartObserved:
		t.Fatal("router start observed before blocked power task released")
	case <-time.After(100 * time.Millisecond):
	}

	close(releasePowerSlot)

	select {
	case reqErr := <-configDone:
		if reqErr != nil {
			t.Fatalf("configurePodRouterCloudInit() error = %v", reqErr)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for router configuration")
	}

	select {
	case <-routerStartObserved:
	case <-time.After(2 * time.Second):
		t.Fatal("router start was not observed after releasing blocked power task")
	}

	select {
	case err := <-blockerDone:
		if err != nil {
			t.Fatalf("blocked PowerAction() error = %v", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for blocked power task")
	}
	if state.startPostCount() != 1 {
		t.Fatalf("router start posts = %d, want 1", state.startPostCount())
	}
}

func TestConfigurePodRouterCloudInitOverlapsOperationSlot(t *testing.T) {
	state := &routerCloudInitTestState{runtimeStatus: "stopped"}
	server := serveRouterCloudInitProxmox(t, state, nil, nil, nil, nil)
	defer server.Close()

	client := proxmox.NewHTTPTestClient(server)
	executor := vmactions.NewExecutor(
		client,
		nil,
		nil,
		vmactions.OperationConfig{Concurrency: 1},
		vmactions.PowerConfig{Concurrency: 1, TaskTimeout: time.Minute},
	)
	handler := newRouterCloudInitTestHandler(client, executor)

	releaseOperation, err := executor.AcquireOperationSlot(context.Background())
	if err != nil {
		t.Fatalf("AcquireOperationSlot() error = %v", err)
	}
	defer releaseOperation()

	configDone := make(chan *requestError, 1)
	go func() {
		configDone <- handler.configurePodRouterCloudInit(
			context.Background(),
			testRouterCloudInitConfig(),
			testRouterCloudInitTargets(),
		)
	}()

	select {
	case reqErr := <-configDone:
		if reqErr != nil {
			t.Fatalf("configurePodRouterCloudInit() error = %v", reqErr)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("router start waited for the occupied operation slot")
	}
	if state.startPostCount() != 1 {
		t.Fatalf("router start posts = %d, want 1", state.startPostCount())
	}
	if state.runtimeStatusValue() != "running" {
		t.Fatalf("runtime status = %q, want running", state.runtimeStatusValue())
	}
}

func TestConfigurePodRouterCloudInitRequiresActions(t *testing.T) {
	var startPosts atomic.Int32

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodGet &&
			r.URL.Path == "/api2/json/nodes/node1/qemu/101/status/current":
			writeProxmoxAPIResponse(t, w, http.StatusOK, map[string]any{"status": "stopped"})
		case r.Method == http.MethodGet &&
			r.URL.Path == "/api2/json/nodes/node1/qemu/101/config":
			writeProxmoxAPIResponse(t, w, http.StatusOK, map[string]any{
				"ide2": "local:cloudinit",
			})
		case r.Method == http.MethodPut &&
			r.URL.Path == "/api2/json/nodes/node1/qemu/101/config":
			writeProxmoxAPIResponse(t, w, http.StatusOK, nil)
		case r.Method == http.MethodPost &&
			strings.Contains(r.URL.Path, "/status/start"):
			startPosts.Add(1)
			t.Fatal("unexpected router start POST with Actions unavailable")
		default:
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
	}))
	defer server.Close()

	handler := &PodsHandler{
		PX: proxmox.NewHTTPTestClient(server),
		RouterCloneConfig: PodRouterCloneConfig{
			RouterWaitTimeout: 3 * time.Second,
		},
	}

	reqErr := handler.configurePodRouterCloudInit(
		context.Background(),
		testRouterCloudInitConfig(),
		testRouterCloudInitTargets(),
	)
	if reqErr == nil {
		t.Fatal("expected request error")
	}
	if reqErr.Status != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want %d", reqErr.Status, http.StatusServiceUnavailable)
	}
	if reqErr.UserMessage != "failed to start router" {
		t.Fatalf("user message = %q", reqErr.UserMessage)
	}
	if reqErr.Operation != "start cloned router" {
		t.Fatalf("operation = %q", reqErr.Operation)
	}
	if !strings.Contains(reqErr.Err.Error(), "vm actions are unavailable") {
		t.Fatalf("error = %v, want VM actions unavailable", reqErr.Err)
	}
	if startPosts.Load() != 0 {
		t.Fatalf("start posts = %d, want 0", startPosts.Load())
	}
}
