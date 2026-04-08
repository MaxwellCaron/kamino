package principals

import (
	"context"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/google/uuid"
)

type Provider interface {
	ListUsers(ctx context.Context) ([]database.GetAllUsersRow, error)
	CreateUser(ctx context.Context, username, password, description string) error
	UpdateUser(ctx context.Context, id uuid.UUID, username, description string) error
	SetPassword(ctx context.Context, id uuid.UUID, password string) error
	EnableUser(ctx context.Context, id uuid.UUID) error
	DisableUser(ctx context.Context, id uuid.UUID) error
	DeleteUser(ctx context.Context, id uuid.UUID) error

	ListGroups(ctx context.Context) ([]database.GetAllGroupsRow, error)
	CreateGroup(ctx context.Context, name, description string) error
	UpdateGroup(ctx context.Context, id uuid.UUID, name, description string) error
	DeleteGroup(ctx context.Context, id uuid.UUID) error

	GetGroupMembers(ctx context.Context, groupID uuid.UUID) ([]database.GetGroupMembersRow, error)
	AddGroupMember(ctx context.Context, groupID, memberID uuid.UUID) error
	RemoveGroupMember(ctx context.Context, groupID, memberID uuid.UUID) error

	GetUserGroups(ctx context.Context, userID uuid.UUID) ([]database.GetUserGroupsRow, error)

	TriggerSync(ctx context.Context) error
}
