package activedirectory

import (
	"testing"

	"github.com/google/uuid"
)

func TestCreatesCycle(t *testing.T) {
	a := uuid.New()
	b := uuid.New()
	c := uuid.New()

	tests := []struct {
		name     string
		children map[uuid.UUID][]uuid.UUID
		groupID  uuid.UUID
		memberID uuid.UUID
		want     bool
	}{
		{
			name:     "empty graph",
			children: map[uuid.UUID][]uuid.UUID{},
			groupID:  a,
			memberID: b,
			want:     false,
		},
		{
			name: "two node cycle",
			children: map[uuid.UUID][]uuid.UUID{
				a: {b},
			},
			groupID:  b,
			memberID: a,
			want:     true,
		},
		{
			name: "three node cycle",
			children: map[uuid.UUID][]uuid.UUID{
				a: {b},
				b: {c},
			},
			groupID:  c,
			memberID: a,
			want:     true,
		},
		{
			name: "diamond shortcut",
			children: map[uuid.UUID][]uuid.UUID{
				a: {b},
				b: {c},
			},
			groupID:  a,
			memberID: c,
			want:     false,
		},
		{
			name:     "self loop",
			children: map[uuid.UUID][]uuid.UUID{},
			groupID:  a,
			memberID: a,
			want:     true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := createsCycle(tt.children, tt.groupID, tt.memberID)
			if got != tt.want {
				t.Fatalf("createsCycle(...) = %t, want %t", got, tt.want)
			}
		})
	}
}
