package proxmox

import (
	"math"
	"strings"
	"testing"
)

func TestPickOptimalNode(t *testing.T) {
	const gib = int64(1 << 30)

	tests := []struct {
		name    string
		nodes   []Node
		want    string
		wantErr string
	}{
		{
			name: "least utilized wins on percent not bytes",
			nodes: []Node{
				{
					Node: "big", Status: "online",
					MaxMem: 1024 * gib, Mem: 819 * gib,
					CPU: 0.75, MaxCPU: 64,
				},
				{
					Node: "small", Status: "online",
					MaxMem: 256 * gib, Mem: 52 * gib,
					CPU: 0.10, MaxCPU: 16,
				},
			},
			want: "small",
		},
		{
			name: "cpu breaks a memory near tie",
			nodes: []Node{
				{
					Node: "busy-cpu", Status: "online",
					MaxMem: 256 * gib, Mem: 128 * gib,
					CPU: 0.90, MaxCPU: 32,
				},
				{
					Node: "idle-cpu", Status: "online",
					MaxMem: 256 * gib, Mem: 128 * gib,
					CPU: 0.05, MaxCPU: 32,
				},
			},
			want: "idle-cpu",
		},
		{
			name: "offline node never wins",
			nodes: []Node{
				{
					Node: "offline-perfect", Status: "offline",
					MaxMem: 256 * gib, Mem: 0,
					CPU: 0, MaxCPU: 32,
				},
				{
					Node: "online-half", Status: "online",
					MaxMem: 256 * gib, Mem: 128 * gib,
					CPU: 0.50, MaxCPU: 32,
				},
			},
			want: "online-half",
		},
		{
			name: "zeroed counters never win",
			nodes: []Node{
				{
					Node: "stale", Status: "online",
					MaxMem: 0, Mem: 0,
					MaxCPU: 0, CPU: 0,
				},
				{
					Node: "normal", Status: "online",
					MaxMem: 256 * gib, Mem: 128 * gib,
					CPU: 0.50, MaxCPU: 32,
				},
			},
			want: "normal",
		},
		{
			name: "deterministic tiebreak",
			nodes: []Node{
				{
					Node: "pve2", Status: "online",
					MaxMem: 256 * gib, Mem: 128 * gib,
					CPU: 0.50, MaxCPU: 32,
				},
				{
					Node: "pve1", Status: "online",
					MaxMem: 256 * gib, Mem: 128 * gib,
					CPU: 0.50, MaxCPU: 32,
				},
			},
			want: "pve1",
		},
		{
			name: "all nodes ineligible",
			nodes: []Node{
				{
					Node: "offline-only", Status: "offline",
					MaxMem: 256 * gib, Mem: 0,
					CPU: 0, MaxCPU: 32,
				},
			},
			wantErr: "no online cluster nodes available",
		},
		{
			name:    "empty input",
			nodes:   []Node{},
			wantErr: "no online cluster nodes available",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, err := pickOptimalNode(tc.nodes)
			if tc.wantErr != "" {
				if err == nil {
					t.Fatalf("pickOptimalNode() err = nil, want error containing %q", tc.wantErr)
				}
				if !strings.Contains(err.Error(), tc.wantErr) {
					t.Fatalf("pickOptimalNode() err = %q, want error containing %q", err, tc.wantErr)
				}
				return
			}
			if err != nil {
				t.Fatalf("pickOptimalNode() err = %v, want nil", err)
			}
			if got.Node != tc.want {
				t.Fatalf("pickOptimalNode() = %q, want %q", got.Node, tc.want)
			}
		})
	}
}

func TestNodeCapacityScore(t *testing.T) {
	const gib = int64(1 << 30)

	tests := []struct {
		name  string
		node  Node
		want  float64
		exact bool
	}{
		{
			name: "fully idle",
			node: Node{
				MaxMem: 256 * gib, Mem: 0,
				MaxCPU: 32, CPU: 0,
			},
			want:  1.0,
			exact: true,
		},
		{
			name: "fully consumed",
			node: Node{
				MaxMem: 256 * gib, Mem: 256 * gib,
				MaxCPU: 32, CPU: 1,
			},
			want:  0.0,
			exact: true,
		},
		{
			name: "over reported usage clamped to zero",
			node: Node{
				MaxMem: 256 * gib, Mem: 300 * gib,
				MaxCPU: 32, CPU: 1.2,
			},
			want:  0.0,
			exact: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := nodeCapacityScore(tc.node)
			if tc.exact {
				if math.Abs(got-tc.want) > 1e-9 {
					t.Fatalf("nodeCapacityScore() = %v, want %v", got, tc.want)
				}
				return
			}
			if got < 0 {
				t.Fatalf("nodeCapacityScore() = %v, want non-negative", got)
			}
		})
	}
}
