package proxmoxprincipals

import (
	"context"
	"errors"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/principals"
	"github.com/MaxwellCaron/kamino/internal/proxmox"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Sync struct {
	db     *pgxpool.Pool
	client accessClient
}

func NewSync(db *pgxpool.Pool, client accessClient) *Sync {
	return &Sync{db: db, client: client}
}

func principalCreatedAtParam(createdAt time.Time) pgtype.Timestamptz {
	return pgtype.Timestamptz{Time: createdAt.UTC(), Valid: true}
}

func (s *Sync) Run(ctx context.Context) error {
	log.Println("Starting Proxmox principal sync")

	groups, err := s.client.ListAccessGroups(ctx)
	if err != nil {
		return fmt.Errorf("fetching Proxmox groups: %w", err)
	}

	users, err := s.client.ListAccessUsers(ctx)
	if err != nil {
		return fmt.Errorf("fetching Proxmox users: %w", err)
	}

	tx, err := s.db.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	q := database.New(tx)
	providerID, err := ensureProvider(ctx, q)
	if err != nil {
		return fmt.Errorf("ensuring provider: %w", err)
	}

	groupExternalToID := make(map[string]uuid.UUID, len(groups))
	userExternalToID := make(map[string]uuid.UUID, len(users))
	keptExternalIDs := make([]string, 0, len(groups)+len(users))
	now := time.Now().UTC()

	for _, group := range groups {
		groupID := strings.TrimSpace(group.GroupID)
		if groupID == "" {
			continue
		}
		name := groupID
		id, err := q.UpsertSyncedPrincipal(ctx, database.UpsertSyncedPrincipalParams{
			ProviderID:    providerID,
			PrincipalType: database.PrincipalTypeGroup,
			ExternalID:    groupID,
			Name:          &name,
			CreatedAt:     principalCreatedAtParam(now),
		})
		if err != nil {
			return fmt.Errorf("upserting group %q: %w", groupID, err)
		}
		var description *string
		if comment := strings.TrimSpace(group.Comment); comment != "" {
			description = &comment
		}
		if err := q.UpdatePrincipalDescription(ctx, database.UpdatePrincipalDescriptionParams{
			Description: description,
			ID:          id,
		}); err != nil {
			return fmt.Errorf("updating group description %q: %w", groupID, err)
		}
		groupExternalToID[groupID] = id
		keptExternalIDs = append(keptExternalIDs, groupID)
	}

	for _, user := range users {
		userID := strings.TrimSpace(user.UserID)
		if userID == "" {
			continue
		}
		name := userID
		id, err := q.UpsertSyncedPrincipal(ctx, database.UpsertSyncedPrincipalParams{
			ProviderID:    providerID,
			PrincipalType: database.PrincipalTypeUser,
			ExternalID:    userID,
			Name:          &name,
			CreatedAt:     principalCreatedAtParam(now),
		})
		if err != nil {
			return fmt.Errorf("upserting user %q: %w", userID, err)
		}

		var description *string
		if comment := strings.TrimSpace(user.Comment); comment != "" {
			description = &comment
		}
		if err := q.UpdatePrincipalDescription(ctx, database.UpdatePrincipalDescriptionParams{
			Description: description,
			ID:          id,
		}); err != nil {
			return fmt.Errorf("updating user description %q: %w", userID, err)
		}

		fullName := accessUserFullName(user.FirstName, user.LastName)
		normalizedFullName, err := principals.NormalizeFullName(fullName)
		if err != nil {
			return fmt.Errorf("normalizing full name for user %q: %w", userID, err)
		}
		var fullNameValue *string
		if normalizedFullName != "" {
			fullNameValue = &normalizedFullName
		}
		if err := q.UpdatePrincipalFullName(ctx, database.UpdatePrincipalFullNameParams{
			FullName: fullNameValue,
			ID:       id,
		}); err != nil {
			return fmt.Errorf("updating user full name %q: %w", userID, err)
		}

		userActive := user.Enable == 1
		if err := q.UpdatePrincipalStatus(ctx, database.UpdatePrincipalStatusParams{
			Status: &userActive,
			ID:     id,
		}); err != nil {
			return fmt.Errorf("updating user status %q: %w", userID, err)
		}

		userExternalToID[userID] = id
		keptExternalIDs = append(keptExternalIDs, userID)
	}

	removed, err := q.DeleteStalePrincipals(ctx, database.DeleteStalePrincipalsParams{
		ProviderID:      providerID,
		KeptExternalIds: keptExternalIDs,
	})
	if err != nil {
		return fmt.Errorf("deleting stale principals: %w", err)
	}
	if removed > 0 {
		log.Printf("Removed %d stale Proxmox principals", removed)
	}

	if err := q.DeleteGroupMembershipsByProvider(ctx, providerID); err != nil {
		return fmt.Errorf("clearing group memberships: %w", err)
	}

	for _, membership := range proxmoxMemberships(users, groups) {
		memberID, ok := userExternalToID[membership.userID]
		if !ok {
			continue
		}
		groupPrincipalID, ok := groupExternalToID[membership.groupID]
		if !ok {
			continue
		}
		if err := q.InsertGroupMembership(ctx, database.InsertGroupMembershipParams{
			GroupID:  groupPrincipalID,
			MemberID: memberID,
		}); err != nil {
			return fmt.Errorf("inserting membership for user %q: %w", membership.userID, err)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit tx: %w", err)
	}

	log.Printf("Proxmox principal sync complete: %d groups, %d users", len(groups), len(users))
	return nil
}

type proxmoxMembership struct {
	groupID string
	userID  string
}

func proxmoxMemberships(users []proxmox.AccessUser, groups []proxmox.AccessGroup) []proxmoxMembership {
	seen := make(map[proxmoxMembership]struct{})
	memberships := make([]proxmoxMembership, 0)

	add := func(groupID, userID string) {
		membership := proxmoxMembership{
			groupID: strings.TrimSpace(groupID),
			userID:  strings.TrimSpace(userID),
		}
		if membership.groupID == "" || membership.userID == "" {
			return
		}
		if _, ok := seen[membership]; ok {
			return
		}
		seen[membership] = struct{}{}
		memberships = append(memberships, membership)
	}

	for _, user := range users {
		userID := strings.TrimSpace(user.UserID)
		for _, groupID := range proxmox.ParseAccessGroups(user.Groups) {
			add(groupID, userID)
		}
	}
	for _, group := range groups {
		groupID := strings.TrimSpace(group.GroupID)
		for _, userID := range proxmox.ParseAccessUsers(group.Users) {
			add(groupID, userID)
		}
	}

	return memberships
}

func ensureProvider(ctx context.Context, q *database.Queries) (uuid.UUID, error) {
	id, err := q.GetPrincipalProviderByType(ctx, database.PrincipalProviderTypeProxmox)
	if err == nil {
		return id, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, err
	}
	return q.CreatePrincipalProvider(ctx, database.CreatePrincipalProviderParams{
		ProviderType: database.PrincipalProviderTypeProxmox,
		Name:         "Proxmox",
	})
}
