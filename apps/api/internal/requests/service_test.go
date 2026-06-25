package requests

import (
	"testing"
	"time"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

func TestParseLimit(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		want    int32
		wantErr bool
	}{
		{"empty returns default", "", defaultPageSize, false},
		{"valid limit", "25", 25, false},
		{"minimum limit", "1", 1, false},
		{"maximum limit", "100", 100, false},
		{"over max capped", "200", maxPageSize, false},
		{"zero rejected", "0", 0, true},
		{"negative rejected", "-1", 0, true},
		{"non-numeric rejected", "abc", 0, true},
		{"float rejected", "1.5", 0, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := ParseLimit(tt.input)
			if (err != nil) != tt.wantErr {
				t.Errorf("ParseLimit(%q) error = %v, wantErr %v", tt.input, err, tt.wantErr)
				return
			}
			if got != tt.want {
				t.Errorf("ParseLimit(%q) = %d, want %d", tt.input, got, tt.want)
			}
		})
	}
}

func TestCursorRoundTrip(t *testing.T) {
	id := uuid.New()
	now := time.Now().Truncate(time.Microsecond)
	cursor := RequestCursor{
		UpdatedAt: now,
		CreatedAt: now.Add(-time.Hour),
		ID:        id,
	}

	encoded := EncodeCursor(cursor)
	decoded, err := DecodeCursor(encoded)
	if err != nil {
		t.Fatalf("DecodeCursor() error = %v", err)
	}

	if !decoded.UpdatedAt.Equal(cursor.UpdatedAt) {
		t.Errorf("UpdatedAt = %v, want %v", decoded.UpdatedAt, cursor.UpdatedAt)
	}
	if !decoded.CreatedAt.Equal(cursor.CreatedAt) {
		t.Errorf("CreatedAt = %v, want %v", decoded.CreatedAt, cursor.CreatedAt)
	}
	if decoded.ID != cursor.ID {
		t.Errorf("ID = %v, want %v", decoded.ID, cursor.ID)
	}
}

func TestDecodeCursorInvalidBase64(t *testing.T) {
	_, err := DecodeCursor("not-valid-base64!!!")
	if err == nil {
		t.Error("DecodeCursor() expected error for invalid base64")
	}
}

func TestDecodeCursorInvalidJSON(t *testing.T) {
	_, err := DecodeCursor("bm90LWpzb24")
	if err == nil {
		t.Error("DecodeCursor() expected error for invalid JSON")
	}
}

func TestPaginateCompletedForKindsUsesLastReturnedRowAsCursor(t *testing.T) {
	base := time.Now().Truncate(time.Microsecond)
	rows := []database.ListCompletedRequestsForKindsPaginatedRow{
		paginatedCompletedRow(base, 0),
		paginatedCompletedRow(base.Add(-time.Minute), 1),
		paginatedCompletedRow(base.Add(-2*time.Minute), 2),
	}

	got := paginateCompletedForKinds(rows, 2)

	if len(got.Items) != 2 {
		t.Fatalf("len(Items) = %d, want 2", len(got.Items))
	}
	if got.NextCursor == nil {
		t.Fatal("NextCursor is nil, want cursor")
	}
	if got.NextCursor.ID != rows[1].ID {
		t.Errorf("NextCursor.ID = %v, want %v", got.NextCursor.ID, rows[1].ID)
	}
}

func paginatedCompletedRow(updatedAt time.Time, offset int) database.ListCompletedRequestsForKindsPaginatedRow {
	return database.ListCompletedRequestsForKindsPaginatedRow{
		ID:        uuid.New(),
		UpdatedAt: pgtype.Timestamptz{Time: updatedAt, Valid: true},
		CreatedAt: pgtype.Timestamptz{
			Time:  updatedAt.Add(time.Duration(offset) * time.Second),
			Valid: true,
		},
	}
}
