package activedirectory

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/principals"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Service struct {
	db     *pgxpool.Pool
	client *Client
	sync   *Sync
}

func NewService(db *pgxpool.Pool, client *Client, sync *Sync) *Service {
	return &Service{db: db, client: client, sync: sync}
}

func (s *Service) getProviderID(ctx context.Context) (uuid.UUID, error) {
	q := database.New(s.db)
	id, err := q.GetPrincipalProvider(ctx)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return uuid.Nil, errors.New("no principal provider configured")
		}
		return uuid.Nil, err
	}
	return id, nil
}

func (s *Service) lookupDN(sid string, objectType string) (string, error) {
	if objectType == "user" {
		users, err := s.client.FetchUsers()
		if err != nil {
			return "", err
		}
		for _, u := range users {
			if u.SID == sid {
				return u.DN, nil
			}
		}
	} else {
		groups, err := s.client.FetchGroups()
		if err != nil {
			return "", err
		}
		for _, g := range groups {
			if g.SID == sid {
				return g.DN, nil
			}
		}
	}
	return "", principals.ErrPrincipalNotFound
}

func (s *Service) upsertCreatedPrincipal(
	ctx context.Context,
	principalType database.PrincipalType,
	externalID string,
	name string,
	description string,
	createdAt time.Time,
) (uuid.UUID, error) {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return uuid.Nil, err
	}
	defer tx.Rollback(ctx)

	q := database.New(tx)
	providerID, err := ensureProvider(ctx, q)
	if err != nil {
		return uuid.Nil, err
	}

	principalID, err := q.UpsertSyncedPrincipal(ctx, database.UpsertSyncedPrincipalParams{
		ProviderID:    providerID,
		PrincipalType: principalType,
		ExternalID:    externalID,
		Name:          &name,
		CreatedAt:     principalCreatedAtParam(createdAt),
	})
	if err != nil {
		return uuid.Nil, err
	}

	if err := q.UpdatePrincipalDescription(ctx, database.UpdatePrincipalDescriptionParams{
		Description: &description,
		ID:          principalID,
	}); err != nil {
		return uuid.Nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return uuid.Nil, err
	}

	return principalID, nil
}

func (s *Service) ListUsers(ctx context.Context) ([]database.GetAllUsersRow, error) {
	providerID, err := s.getProviderID(ctx)
	if err != nil {
		return nil, err
	}
	return database.New(s.db).GetAllUsers(ctx, providerID)
}

func (s *Service) CreateUser(ctx context.Context, username, password, description string) (uuid.UUID, error) {
	if err := ValidateADCreateName(username); err != nil {
		return uuid.Nil, err
	}

	createdUser, err := s.client.CreateUser(username, password, description)
	if err != nil {
		return uuid.Nil, err
	}

	return s.upsertCreatedPrincipal(
		ctx,
		database.PrincipalTypeUser,
		createdUser.SID,
		createdUser.Username,
		description,
		createdUser.CreatedAt,
	)
}

func (s *Service) UpdateUser(ctx context.Context, id uuid.UUID, username, fullName, description string) error {
	normalizedFullName, err := principals.NormalizeFullName(fullName)
	if err != nil {
		return err
	}

	q := database.New(s.db)
	p, err := q.GetPrincipalByID(ctx, id)
	if err != nil {
		return err
	}

	dn, err := s.lookupDN(p.ExternalID, "user")
	if err != nil {
		return err
	}

	if err := s.client.UpdateUser(dn, username, normalizedFullName, description); err != nil {
		return err
	}

	providerID, err := s.getProviderID(ctx)
	if err != nil {
		return err
	}

	_, err = q.UpsertPrincipal(ctx, database.UpsertPrincipalParams{
		ProviderID:    providerID,
		PrincipalType: p.PrincipalType,
		ExternalID:    p.ExternalID,
		Name:          &username,
	})
	if err != nil {
		return err
	}

	if err := q.UpdatePrincipalDescription(ctx, database.UpdatePrincipalDescriptionParams{
		Description: &description,
		ID:          id,
	}); err != nil {
		return err
	}

	var fullNameValue *string
	if normalizedFullName != "" {
		fullNameValue = &normalizedFullName
	}

	return q.UpdatePrincipalFullName(ctx, database.UpdatePrincipalFullNameParams{
		FullName: fullNameValue,
		ID:       id,
	})
}

func (s *Service) SetPassword(ctx context.Context, id uuid.UUID, password string) error {
	q := database.New(s.db)
	p, err := q.GetPrincipalByID(ctx, id)
	if err != nil {
		return err
	}

	dn, err := s.lookupDN(p.ExternalID, "user")
	if err != nil {
		return err
	}

	return s.client.SetPassword(dn, password)
}

func (s *Service) ChangePassword(
	ctx context.Context,
	id uuid.UUID,
	oldPassword, newPassword string,
) error {
	q := database.New(s.db)
	p, err := q.GetPrincipalByID(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return principals.ErrPrincipalNotFound
		}
		return err
	}
	if p.PrincipalType != database.PrincipalTypeUser {
		return principals.ErrUnsupportedPrincipal
	}

	dn, err := s.lookupDN(p.ExternalID, "user")
	if err != nil {
		return principals.ErrPrincipalNotFound
	}

	if err := s.client.AuthenticateDN(dn, oldPassword); err != nil {
		return principals.ErrInvalidCredentials
	}

	return s.client.SetPassword(dn, newPassword)
}

func (s *Service) EnableUser(ctx context.Context, id uuid.UUID) error {
	q := database.New(s.db)
	p, err := q.GetPrincipalByID(ctx, id)
	if err != nil {
		return err
	}

	dn, err := s.lookupDN(p.ExternalID, "user")
	if err != nil {
		return err
	}

	return s.client.EnableUser(dn)
}

func (s *Service) DisableUser(ctx context.Context, id uuid.UUID) error {
	q := database.New(s.db)
	p, err := q.GetPrincipalByID(ctx, id)
	if err != nil {
		return err
	}

	dn, err := s.lookupDN(p.ExternalID, "user")
	if err != nil {
		return err
	}

	return s.client.DisableUser(dn)
}

func (s *Service) DeleteUser(ctx context.Context, id uuid.UUID) error {
	q := database.New(s.db)
	p, err := q.GetPrincipalByID(ctx, id)
	if err != nil {
		return err
	}
	if p.PrincipalType != database.PrincipalTypeUser {
		return principals.ErrUnsupportedPrincipal
	}
	if err := ensurePrincipalDeletable(ctx, q, id); err != nil {
		return err
	}

	dn, err := s.lookupDN(p.ExternalID, "user")
	if err != nil {
		if errors.Is(err, principals.ErrPrincipalNotFound) {
			return q.DeletePrincipal(ctx, id)
		}
		return err
	}

	if err := s.client.DeleteUser(dn); err != nil {
		return err
	}

	return q.DeletePrincipal(ctx, id)
}

func (s *Service) ListGroups(ctx context.Context) ([]database.GetAllGroupsRow, error) {
	providerID, err := s.getProviderID(ctx)
	if err != nil {
		return nil, err
	}
	return database.New(s.db).GetAllGroups(ctx, providerID)
}

func (s *Service) CreateGroup(ctx context.Context, name, description string) (uuid.UUID, error) {
	if err := ValidateADCreateName(name); err != nil {
		return uuid.Nil, err
	}

	createdGroup, err := s.client.CreateGroup(name)
	if err != nil {
		return uuid.Nil, err
	}

	return s.upsertCreatedPrincipal(
		ctx,
		database.PrincipalTypeGroup,
		createdGroup.SID,
		createdGroup.Name,
		description,
		createdGroup.CreatedAt,
	)
}

func (s *Service) UpdateGroup(ctx context.Context, id uuid.UUID, name, description string) error {
	q := database.New(s.db)
	p, err := q.GetPrincipalByID(ctx, id)
	if err != nil {
		return err
	}

	dn, err := s.lookupDN(p.ExternalID, "group")
	if err != nil {
		return err
	}

	if err := s.client.UpdateGroup(dn, name); err != nil {
		return err
	}

	providerID, err := s.getProviderID(ctx)
	if err != nil {
		return err
	}

	_, err = q.UpsertPrincipal(ctx, database.UpsertPrincipalParams{
		ProviderID:    providerID,
		PrincipalType: p.PrincipalType,
		ExternalID:    p.ExternalID,
		Name:          &name,
	})
	if err != nil {
		return err
	}

	return q.UpdatePrincipalDescription(ctx, database.UpdatePrincipalDescriptionParams{
		Description: &description,
		ID:          id,
	})
}

func (s *Service) DeleteGroup(ctx context.Context, id uuid.UUID) error {
	q := database.New(s.db)
	p, err := q.GetPrincipalByID(ctx, id)
	if err != nil {
		return err
	}
	if p.PrincipalType != database.PrincipalTypeGroup {
		return principals.ErrUnsupportedPrincipal
	}
	if err := ensurePrincipalDeletable(ctx, q, id); err != nil {
		return err
	}

	dn, err := s.lookupDN(p.ExternalID, "group")
	if err != nil {
		if errors.Is(err, principals.ErrPrincipalNotFound) {
			return q.DeletePrincipal(ctx, id)
		}
		return err
	}

	if err := s.client.DeleteGroup(dn); err != nil {
		return err
	}

	return q.DeletePrincipal(ctx, id)
}

func ensurePrincipalDeletable(ctx context.Context, q *database.Queries, id uuid.UUID) error {
	blockers, err := q.ListPrincipalDeletionBlockers(ctx, id)
	if err != nil {
		return err
	}
	if len(blockers) == 0 {
		return nil
	}

	blocker := blockers[0]
	return fmt.Errorf(
		"%w: %s %q references this principal",
		principals.ErrPrincipalInUse,
		blocker.BlockerType,
		blocker.BlockerName,
	)
}

func (s *Service) GetGroupMembers(ctx context.Context, groupID uuid.UUID) ([]database.GetGroupMembersRow, error) {
	q := database.New(s.db)
	return q.GetGroupMembers(ctx, groupID)
}

func dedupeUUIDs(ids []uuid.UUID) []uuid.UUID {
	seen := make(map[uuid.UUID]struct{}, len(ids))
	deduped := make([]uuid.UUID, 0, len(ids))
	for _, id := range ids {
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		deduped = append(deduped, id)
	}
	return deduped
}

func (s *Service) updateGroupMembers(
	ctx context.Context,
	groupID uuid.UUID,
	memberIDs []uuid.UUID,
	add bool,
) (map[uuid.UUID]error, error) {
	q := database.New(s.db)

	group, err := q.GetPrincipalByID(ctx, groupID)
	if err != nil {
		return nil, err
	}

	groupDN, err := s.lookupDN(group.ExternalID, "group")
	if err != nil {
		return nil, err
	}

	currentMembers, err := q.GetGroupMembers(ctx, groupID)
	if err != nil {
		return nil, err
	}

	currentMemberSet := make(map[uuid.UUID]struct{}, len(currentMembers))
	for _, member := range currentMembers {
		currentMemberSet[member.ID] = struct{}{}
	}

	failed := make(map[uuid.UUID]error)

	for _, memberID := range dedupeUUIDs(memberIDs) {
		_, isMember := currentMemberSet[memberID]
		if add && isMember {
			continue
		}
		if !add && !isMember {
			continue
		}

		member, err := q.GetPrincipalByID(ctx, memberID)
		if err != nil {
			failed[memberID] = err
			continue
		}

		memberDN, err := s.lookupDN(member.ExternalID, string(member.PrincipalType))
		if err != nil {
			failed[memberID] = err
			continue
		}

		if add {
			err = s.client.AddGroupMember(groupDN, memberDN)
		} else {
			err = s.client.RemoveGroupMember(groupDN, memberDN)
		}
		if err != nil {
			failed[memberID] = err
			continue
		}

		if add {
			if err := q.InsertGroupMembership(ctx, database.InsertGroupMembershipParams{
				GroupID:  groupID,
				MemberID: memberID,
			}); err != nil {
				return failed, fmt.Errorf("persist added group membership: %w", err)
			}
			currentMemberSet[memberID] = struct{}{}
			continue
		}

		if err := q.DeleteGroupMembership(ctx, database.DeleteGroupMembershipParams{
			GroupID:  groupID,
			MemberID: memberID,
		}); err != nil {
			return failed, fmt.Errorf("persist removed group membership: %w", err)
		}
		delete(currentMemberSet, memberID)
	}

	return failed, nil
}

func (s *Service) AddGroupMembers(
	ctx context.Context,
	groupID uuid.UUID,
	memberIDs []uuid.UUID,
) (map[uuid.UUID]error, error) {
	return s.updateGroupMembers(ctx, groupID, memberIDs, true)
}

func (s *Service) RemoveGroupMembers(
	ctx context.Context,
	groupID uuid.UUID,
	memberIDs []uuid.UUID,
) (map[uuid.UUID]error, error) {
	return s.updateGroupMembers(ctx, groupID, memberIDs, false)
}

func (s *Service) GetUserGroups(ctx context.Context, userID uuid.UUID) ([]database.GetUserGroupsRow, error) {
	q := database.New(s.db)
	return q.GetUserGroups(ctx, userID)
}

func (s *Service) TriggerSync(ctx context.Context) error {
	return s.sync.Run(ctx)
}
