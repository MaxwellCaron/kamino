package auth

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"
)

func TestRevokeSessionClosesTransactionOnFailure(t *testing.T) {
	for _, stage := range []string{"write", "commit"} {
		t.Run(stage, func(t *testing.T) {
			store := newFakeSessionStore()
			store.putSession(fakeSessionRow{id: uuid.New(), tokenHash: hashOpaqueToken("token")})
			failure := errors.New("database unavailable")
			if stage == "write" {
				store.execErr = failure
			} else {
				store.commitErr = failure
			}
			manager := &SessionManager{store: store}
			if err := manager.RevokeSession(context.Background(), "token"); !errors.Is(err, failure) {
				t.Fatalf("RevokeSession() = %v", err)
			}
			if store.lastTx == nil || !store.lastTx.rolledBack {
				t.Fatal("failed revoke left transaction open")
			}
		})
	}
}
