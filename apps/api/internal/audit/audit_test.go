package audit

import "testing"

func TestNormalizeListParamsDefaults(t *testing.T) {
	page, rows, offset := normalizeListParams(ListParams{})

	if page != 1 {
		t.Errorf("page = %d, want 1", page)
	}
	if rows != 25 {
		t.Errorf("rows = %d, want 25", rows)
	}
	if offset != 0 {
		t.Errorf("offset = %d, want 0", offset)
	}
}

func TestNormalizeListParamsComputesOffset(t *testing.T) {
	tests := []struct {
		name       string
		params     ListParams
		wantPage   int32
		wantRows   int32
		wantOffset int32
	}{
		{"page 1 rows 25", ListParams{Page: 1, Rows: 25}, 1, 25, 0},
		{"page 2 rows 25", ListParams{Page: 2, Rows: 25}, 2, 25, 25},
		{"page 4 rows 10", ListParams{Page: 4, Rows: 10}, 4, 10, 30},
		{"negative page defaults to 1", ListParams{Page: -3, Rows: 10}, 1, 10, 0},
		{"zero rows defaults to 25", ListParams{Page: 1, Rows: 0}, 1, 25, 0},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			page, rows, offset := normalizeListParams(tt.params)
			if page != tt.wantPage {
				t.Errorf("page = %d, want %d", page, tt.wantPage)
			}
			if rows != tt.wantRows {
				t.Errorf("rows = %d, want %d", rows, tt.wantRows)
			}
			if offset != tt.wantOffset {
				t.Errorf("offset = %d, want %d", offset, tt.wantOffset)
			}
		})
	}
}
