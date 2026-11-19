package podnetwork

import "testing"

func TestParseIPv4Subnet24(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		want    string
		wantErr bool
	}{
		{"canonical", "192.168.1.0/24", "192.168.1.0/24", false},
		{"padded with whitespace", "  192.168.1.0/24  ", "192.168.1.0/24", false},
		{"empty", "", "", true},
		{"malformed", "not-a-cidr", "", true},
		{"ipv6", "fd00::/24", "", true},
		{"slash16", "192.168.0.0/16", "", true},
		{"slash25", "192.168.1.0/25", "", true},
		{"host address", "192.168.1.7/24", "", true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := ParseIPv4Subnet24(tt.input)
			if tt.wantErr {
				if err == nil {
					t.Fatalf("expected error, got %v", got)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got.String() != tt.want {
				t.Errorf("ParseIPv4Subnet24(%q) = %q, want %q", tt.input, got.String(), tt.want)
			}
		})
	}
}
