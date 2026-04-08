package activedirectory

import (
	"context"
	"errors"
	"log"

	"github.com/MaxwellCaron/kamino/database"
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
	return "", errors.New("principal not found in AD")
}

func (s *Service) syncBeforeResponse(ctx context.Context) {
	if err := s.sync.Run(ctx); err != nil {
		log.Printf("AD sync after mutation failed: %v", err)
	}
}

func (s *Service) ListUsers(ctx context.Context) ([]database.GetAllUsersRow, error) {
	providerID, err := s.getProviderID(ctx)
	if err != nil {
		return nil, err
	}
	return database.New(s.db).GetAllUsers(ctx, providerID)
}

func (s *Service) CreateUser(ctx context.Context, username, password, description string) error {
	if err := s.client.CreateUser(username, password); err != nil {
		return err
	}
	s.syncBeforeResponse(ctx)

	users, err := s.ListUsers(ctx)
	if err == nil {
		for _, u := range users {
			if u.Name != nil && *u.Name == username {
				_ = database.New(s.db).UpdatePrincipalDescription(ctx, database.UpdatePrincipalDescriptionParams{
					Description: &description,
					ID:          u.ID,
				})
				break
			}
		}
	}

	return nil
}

func (s *Service) UpdateUser(ctx context.Context, id uuid.UUID, username, description string) error {
	q := database.New(s.db)
	p, err := q.GetPrincipalByID(ctx, id)
	if err != nil {
		return err
	}

	dn, err := s.lookupDN(p.ExternalID, "user")
	if err != nil {
		return err
	}

	if err := s.client.UpdateUser(dn, username); err != nil {
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

	return q.UpdatePrincipalDescription(ctx, database.UpdatePrincipalDescriptionParams{
		Description: &description,
		ID:          id,
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

	dn, err := s.lookupDN(p.ExternalID, "user")
	if err != nil {
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

func (s *Service) CreateGroup(ctx context.Context, name, description string) error {
	if err := s.client.CreateGroup(name); err != nil {
		return err
	}
	s.syncBeforeResponse(ctx)

	groups, err := s.ListGroups(ctx)
	if err == nil {
		for _, g := range groups {
			if g.Name != nil && *g.Name == name {
				_ = database.New(s.db).UpdatePrincipalDescription(ctx, database.UpdatePrincipalDescriptionParams{
					Description: &description,
					ID:          g.ID,
				})
				break
			}
		}
	}

	return nil
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

	dn, err := s.lookupDN(p.ExternalID, "group")
	if err != nil {
		return err
	}

	if err := s.client.DeleteGroup(dn); err != nil {
		return err
	}

	return q.DeletePrincipal(ctx, id)
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
	changed := false

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

		changed = true
	}

	if changed {
		s.syncBeforeResponse(ctx)
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
