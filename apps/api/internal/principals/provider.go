package principals

import (
	"context"
	"errors"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/google/uuid"
)

var (
	ErrInvalidCredentials   = errors.New("invalid credentials")
	ErrPrincipalNotFound    = errors.New("principal not found")
	ErrPrincipalInUse       = errors.New("principal is in use")
	ErrUnsupportedPrincipal = errors.New("unsupported principal")
)

type AuthenticatedPrincipal struct {
	ExternalID string
	Username   string
}

type Authenticator interface {
	Authenticate(ctx context.Context, username, password string) (AuthenticatedPrincipal, error)
}

type ProviderCapabilities struct {
	ProviderType         database.PrincipalProviderType `json:"provider_type"`
	DisplayName          string                         `json:"display_name"`
	CanSync              bool                           `json:"can_sync"`
	CanCreateUsers       bool                           `json:"can_create_users"`
	UserPasswordOnCreate bool                           `json:"user_password_on_create"`
	CanRenameUsers       bool                           `json:"can_rename_users"`
	CanSetPasswords      bool                           `json:"can_set_passwords"`
	CanChangeOwnPassword bool                           `json:"can_change_own_password"`
	CanEnableUsers       bool                           `json:"can_enable_users"`
	CanDisableUsers      bool                           `json:"can_disable_users"`
	CanCreateGroups      bool                           `json:"can_create_groups"`
	CanManageMemberships bool                           `json:"can_manage_memberships"`
}

type Provider interface {
	Capabilities() ProviderCapabilities

	ListUsers(ctx context.Context) ([]database.GetAllUsersRow, error)
	CreateUser(ctx context.Context, username, password, description string) (uuid.UUID, error)
	UpdateUser(ctx context.Context, id uuid.UUID, username, fullName, description string) error
	SetPassword(ctx context.Context, id uuid.UUID, password string) error
	ChangePassword(ctx context.Context, id uuid.UUID, oldPassword, newPassword string) error
	EnableUser(ctx context.Context, id uuid.UUID) error
	DisableUser(ctx context.Context, id uuid.UUID) error
	DeleteUser(ctx context.Context, id uuid.UUID) error

	ListGroups(ctx context.Context) ([]database.GetAllGroupsRow, error)
	CreateGroup(ctx context.Context, name, description string) (uuid.UUID, error)
	UpdateGroup(ctx context.Context, id uuid.UUID, name, description string) error
	DeleteGroup(ctx context.Context, id uuid.UUID) error

	GetGroupMembers(ctx context.Context, groupID uuid.UUID) ([]database.GetGroupMembersRow, error)
	AddGroupMembers(ctx context.Context, groupID uuid.UUID, memberIDs []uuid.UUID) (map[uuid.UUID]error, error)
	RemoveGroupMembers(ctx context.Context, groupID uuid.UUID, memberIDs []uuid.UUID) (map[uuid.UUID]error, error)

	GetUserGroups(ctx context.Context, userID uuid.UUID) ([]database.GetUserGroupsRow, error)

	TriggerSync(ctx context.Context) error
}
