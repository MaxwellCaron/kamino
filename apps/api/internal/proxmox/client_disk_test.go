package proxmox

import "testing"

func TestParseSizeToGB(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		want    int
		wantErr bool
	}{
		{
			name:  "gigabytes",
			input: "32G",
			want:  32,
		},
		{
			name:  "terabytes",
			input: "8T",
			want:  8192,
		},
		{
			name:  "megabytes round up",
			input: "512M",
			want:  1,
		},
		{
			name:  "kilobytes round up",
			input: "1024K",
			want:  1,
		},
		{
			name:  "unitless bytes exact gibibytes",
			input: "34359738368",
			want:  32,
		},
		{
			name:  "unitless bytes round up",
			input: "34359738369",
			want:  33,
		},
		{
			name:  "small unitless bytes round up",
			input: "4194304",
			want:  1,
		},
		{
			name:  "lowercase suffix",
			input: "32g",
			want:  32,
		},
		{
			name:    "empty",
			input:   "",
			wantErr: true,
		},
		{
			name:    "invalid",
			input:   "abcG",
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := parseSizeToGB(tt.input)
			if tt.wantErr {
				if err == nil {
					t.Fatalf("parseSizeToGB(%q) expected error", tt.input)
				}
				return
			}
			if err != nil {
				t.Fatalf("parseSizeToGB(%q) unexpected error: %v", tt.input, err)
			}
			if got != tt.want {
				t.Fatalf("parseSizeToGB(%q) = %d, want %d", tt.input, got, tt.want)
			}
		})
	}

	got, err := parseSizeToGB("34359738368")
	if err != nil {
		t.Fatalf("parseSizeToGB regression guard unexpected error: %v", err)
	}
	if got != 32 {
		t.Fatalf("parseSizeToGB regression guard = %d, want 32", got)
	}
}
