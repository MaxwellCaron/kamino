package activedirectory

import (
	"context"
	"testing"

	"github.com/google/uuid"
)

type readOnlyDirectorySyncClient struct {
	groups []Group
	users  []User
}

func (c *readOnlyDirectorySyncClient) FetchGroups(context.Context) ([]Group, error) {
	return c.groups, nil
}

func (c *readOnlyDirectorySyncClient) FetchUsers(context.Context) ([]User, error) {
	return c.users, nil
}

func TestSyncClientRequiresOnlyProviderReads(t *testing.T) {
	client := &readOnlyDirectorySyncClient{
		groups: []Group{{SID: "S-1-GROUP"}},
		users:  []User{{SID: "S-1-USER"}},
	}
	sync := NewSync(nil, client)

	groups, err := sync.client.FetchGroups(context.Background())
	if err != nil {
		t.Fatalf("FetchGroups() error = %v", err)
	}
	if len(groups) != 1 || groups[0].SID != "S-1-GROUP" {
		t.Fatalf("groups = %#v", groups)
	}
}

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
