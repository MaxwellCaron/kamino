package routerconfig

import (
	"testing"
)

func TestNormalizeDottedPrefix(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		want    string
		wantErr bool
	}{
		{"empty string", "", "", false},
		{"whitespace only", "  \t  ", "", false},
		{"single octet", "10", "10.", false},
		{"two octets", "172.16", "172.16.", false},
		{"three octets", "10.128.0", "10.128.0.", false},
		{"four octets", "192.168.1.0", "192.168.1.0.", false},
		{"trailing dot stripped", "172.16.", "172.16.", false},
		{"leading whitespace", "  10.0", "10.0.", false},
		{"trailing whitespace", "10.0  ", "10.0.", false},
		{"zero octet", "0.0", "0.0.", false},
		{"max octet", "255.255", "255.255.", false},
		{"double trailing dot", "172.16..", "", true},
		{"empty parts", "172..16", "", true},
		{"non-numeric octet", "abc.def", "", true},
		{"octet out of range", "256.0.0.1", "", true},
		{"negative octet", "-1.0.0.1", "", true},
		{"mixed valid and invalid", "10.abc.0", "", true},
		{"just a dot", ".", "", true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := NormalizeDottedPrefix(tt.input)
			if tt.wantErr {
				if err == nil {
					t.Fatalf("expected error, got %q", got)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != tt.want {
				t.Errorf("NormalizeDottedPrefix(%q) = %q, want %q", tt.input, got, tt.want)
			}
		})
	}
}

func TestValidateCloudInitSnippetFilename(t *testing.T) {
	tests := []struct {
		name     string
		filename string
		wantErr  bool
	}{
		{"valid simple name", "user-data.yaml", false},
		{"valid with numbers", "kamino-router-24-user-data.yaml", false},
		{"empty string", "", true},
		{"whitespace only", "   ", true},
		{"forward slash", "path/file.yaml", true},
		{"backslash", "path\\file.yaml", true},
		{"double dot", "file..name.yaml", true},
		{"space", "file name.yaml", true},
		{"tab", "file\tname.yaml", true},
		{"newline", "file\nname.yaml", true},
		{"carriage return", "file\rname.yaml", true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidateCloudInitSnippetFilename(tt.filename)
			if tt.wantErr {
				if err == nil {
					t.Fatal("expected error, got nil")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
		})
	}
}

func TestNormalizeCloudInitFilePattern(t *testing.T) {
	tests := []struct {
		name    string
		envName string
		value   string
		want    string
		wantErr bool
	}{
		{"valid pattern", "TEST_PATTERN", "kamino-router-{network}-user.yaml", "kamino-router-{network}-user.yaml", false},
		{"empty value", "TEST_PATTERN", "", "", true},
		{"missing placeholder", "TEST_PATTERN", "kamino-router-user.yaml", "", true},
		{"two placeholders", "TEST_PATTERN", "{network}-{network}.yaml", "", true},
		{"result has path separator", "TEST_PATTERN", "{network}/file.yaml", "", true},
		{"result has double dot", "TEST_PATTERN", "{network}..file.yaml", "", true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := NormalizeCloudInitFilePattern(tt.envName, tt.value)
			if tt.wantErr {
				if err == nil {
					t.Fatalf("expected error, got %q", got)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != tt.want {
				t.Errorf("NormalizeCloudInitFilePattern(%q, %q) = %q, want %q", tt.envName, tt.value, got, tt.want)
			}
		})
	}
}

func TestNormalizeCloudInitFileName(t *testing.T) {
	tests := []struct {
		name    string
		envName string
		value   string
		want    string
		wantErr bool
	}{
		{"valid filename", "TEST_FILE", "kamino-router-network-config.yaml", "kamino-router-network-config.yaml", false},
		{"empty value", "TEST_FILE", "", "", true},
		{"contains placeholder", "TEST_FILE", "kamino-{network}-config.yaml", "", true},
		{"path separator", "TEST_FILE", "path/file.yaml", "", true},
		{"double dot", "TEST_FILE", "file..name.yaml", "", true},
		{"whitespace", "TEST_FILE", "file name.yaml", "", true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := NormalizeCloudInitFileName(tt.envName, tt.value)
			if tt.wantErr {
				if err == nil {
					t.Fatalf("expected error, got %q", got)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != tt.want {
				t.Errorf("NormalizeCloudInitFileName(%q, %q) = %q, want %q", tt.envName, tt.value, got, tt.want)
			}
		})
	}
}
