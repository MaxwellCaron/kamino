package proxmox

import "testing"

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
