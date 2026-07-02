package activedirectory

import (
	"context"
	"errors"
	"fmt"
	"log"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Sync handles syncing AD users and groups into the principals tables.
type Sync struct {
	db     *pgxpool.Pool
	client *Client
}

// NewSync creates a new AD sync service.
func NewSync(db *pgxpool.Pool, client *Client) *Sync {
	return &Sync{db: db, client: client}
}

// Run performs a full sync: fetches users/groups from AD, upserts them as
// principals, syncs group memberships, and removes stale entries.
func (s *Sync) Run(ctx context.Context) error {
	log.Println("Starting Active Directory sync")

	groups, err := s.client.FetchGroups()
	if err != nil {
		return fmt.Errorf("fetching AD groups: %w", err)
	}

	users, err := s.client.FetchUsers()
	if err != nil {
		return fmt.Errorf("fetching AD users: %w", err)
	}

	tx, err := s.db.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	q := database.New(tx)

	// Ensure the AD provider row exists
	providerID, err := ensureProvider(ctx, q)
	if err != nil {
		return fmt.Errorf("ensuring provider: %w", err)
	}

	// Upsert groups and build DN → principal ID map
	dnToID := make(map[string]uuid.UUID, len(groups)+len(users))
	keptSIDs := make([]string, 0, len(groups)+len(users))

	for _, g := range groups {
		id, err := q.UpsertPrincipal(ctx, database.UpsertPrincipalParams{
			ProviderID:    providerID,
			PrincipalType: database.PrincipalTypeGroup,
			ExternalID:    g.SID,
			Name:          &g.Name,
		})
		if err != nil {
			return fmt.Errorf("upserting group %q: %w", g.Name, err)
		}
		dnToID[g.DN] = id
		keptSIDs = append(keptSIDs, g.SID)
	}

	// Upsert users
	for _, u := range users {
		id, err := q.UpsertPrincipal(ctx, database.UpsertPrincipalParams{
			ProviderID:    providerID,
			PrincipalType: database.PrincipalTypeUser,
			ExternalID:    u.SID,
			Name:          &u.Name,
		})
		if err != nil {
			return fmt.Errorf("upserting user %q: %w", u.Name, err)
		}
		dnToID[u.DN] = id
		keptSIDs = append(keptSIDs, u.SID)
	}

	// Delete principals no longer present in AD
	removed, err := q.DeleteStalePrincipals(ctx, database.DeleteStalePrincipalsParams{
		ProviderID:      providerID,
		KeptExternalIds: keptSIDs,
	})
	if err != nil {
		return fmt.Errorf("deleting stale principals: %w", err)
	}
	if removed > 0 {
		log.Printf("Removed %d stale principals", removed)
	}

	// Replace all group memberships: clear then re-insert
	if err := q.DeleteGroupMembershipsByProvider(ctx, providerID); err != nil {
		return fmt.Errorf("clearing group memberships: %w", err)
	}

	for _, g := range groups {
		groupID, ok := dnToID[g.DN]
		if !ok {
			continue
		}
		for _, memberDN := range g.MemberDNs {
			memberID, ok := dnToID[memberDN]
			if !ok {
				// Member is outside the search base OU — skip
				continue
			}
			if memberID == groupID {
				log.Printf("Warning: skipping self-membership for AD group %q", g.Name)
				continue
			}
			if err := q.InsertGroupMembership(ctx, database.InsertGroupMembershipParams{
				GroupID:  groupID,
				MemberID: memberID,
			}); err != nil {
				return fmt.Errorf("inserting membership: %w", err)
			}
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit tx: %w", err)
	}

	log.Printf("AD sync complete: %d groups, %d users", len(groups), len(users))
	return nil
}

func ensureProvider(ctx context.Context, q *database.Queries) (uuid.UUID, error) {
	id, err := q.GetPrincipalProvider(ctx)
	if err == nil {
		return id, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, err
	}
	return q.CreatePrincipalProvider(ctx, database.CreatePrincipalProviderParams{
		ProviderType: database.PrincipalProviderTypeActiveDirectory,
		Name:         "Active Directory",
	})
}
