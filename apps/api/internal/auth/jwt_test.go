package auth

import (
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

// testSecret is a fixed 32-byte secret used across these characterization
// tests so token generation/validation is deterministic.
const testSecret = "01234567890123456789012345678901"

// signClaims mirrors GenerateAccessToken's internals (jwt.go:62-79) but lets
// callers supply arbitrary/invalid claims to exercise ValidateAccessToken's
// rejection paths.
func signClaims(t *testing.T, claims Claims) string {
	t.Helper()

	signed, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(testSecret))
	if err != nil {
		t.Fatalf("sign claims: unexpected error: %v", err)
	}

	return signed
}

func validClaims() Claims {
	now := time.Now().UTC()
	return Claims{
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   uuid.New().String(),
			IssuedAt:  jwt.NewNumericDate(now),
			NotBefore: jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(AccessTokenDuration)),
			Issuer:    jwtIssuer,
			Audience:  jwt.ClaimStrings{jwtAudience},
		},
		TokenType: accessTokenType,
		SessionID: uuid.New().String(),
		Username:  "alice",
	}
}

// TestValidateAccessTokenRoundTrip characterizes the happy path: a token
// produced by GenerateAccessToken validates and yields the same claims.
func TestValidateAccessTokenRoundTrip(t *testing.T) {
	svc, err := NewService(testSecret)
	if err != nil {
		t.Fatalf("NewService: unexpected error: %v", err)
	}

	principalID := uuid.New()
	sessionID := uuid.New()
	username := "alice"

	token, expiresAt, err := svc.GenerateAccessToken(principalID, sessionID, username)
	if err != nil {
		t.Fatalf("GenerateAccessToken: unexpected error: %v", err)
	}
	if expiresAt.IsZero() {
		t.Error("GenerateAccessToken: expiresAt is zero")
	}

	claims, err := svc.ValidateAccessToken(token)
	if err != nil {
		t.Fatalf("ValidateAccessToken: unexpected error: %v", err)
	}

	if claims.Subject != principalID.String() {
		t.Errorf("Subject: got %q, want %q", claims.Subject, principalID.String())
	}
	if claims.SessionID != sessionID.String() {
		t.Errorf("SessionID: got %q, want %q", claims.SessionID, sessionID.String())
	}
	if claims.Username != username {
		t.Errorf("Username: got %q, want %q", claims.Username, username)
	}
	if claims.TokenType != accessTokenType {
		t.Errorf("TokenType: got %q, want %q", claims.TokenType, accessTokenType)
	}

	gotPrincipal, err := claims.PrincipalID()
	if err != nil {
		t.Fatalf("PrincipalID: unexpected error: %v", err)
	}
	if gotPrincipal != principalID {
		t.Errorf("PrincipalID: got %v, want %v", gotPrincipal, principalID)
	}

	gotSession, err := claims.SessionIDParsed()
	if err != nil {
		t.Fatalf("SessionIDParsed: unexpected error: %v", err)
	}
	if gotSession != sessionID {
		t.Errorf("SessionIDParsed: got %v, want %v", gotSession, sessionID)
	}
}

// TestValidateAccessTokenRejections characterizes ValidateAccessToken's
// current rejection behavior across malformed or mismatched tokens.
func TestValidateAccessTokenRejections(t *testing.T) {
	svc, err := NewService(testSecret)
	if err != nil {
		t.Fatalf("NewService: unexpected error: %v", err)
	}

	t.Run("alg none rejected", func(t *testing.T) {
		claims := validClaims()
		token, err := jwt.NewWithClaims(jwt.SigningMethodNone, claims).SignedString(jwt.UnsafeAllowNoneSignatureType)
		if err != nil {
			t.Fatalf("sign alg:none token: unexpected error: %v", err)
		}

		if _, err := svc.ValidateAccessToken(token); err == nil {
			t.Error("ValidateAccessToken: expected error for alg:none token, got nil")
		}
	})

	t.Run("RS256 rejected", func(t *testing.T) {
		// Sign with a different alg than the service expects (HS256). Even
		// though we don't have a real RSA key, the WithValidMethods guard
		// should reject this before any signature verification matters: we
		// assert ValidateAccessToken errors either way.
		claims := validClaims()
		// HS384 is a convenient stand-in for "a method other than HS256"
		// that doesn't require generating an RSA keypair, and exercises the
		// same WithValidMethods guard at jwt.go:92.
		token, err := jwt.NewWithClaims(jwt.SigningMethodHS384, claims).SignedString([]byte(testSecret))
		if err != nil {
			t.Fatalf("sign HS384 token: unexpected error: %v", err)
		}

		if _, err := svc.ValidateAccessToken(token); err == nil {
			t.Error("ValidateAccessToken: expected error for non-HS256 token, got nil")
		}
	})

	t.Run("expired", func(t *testing.T) {
		claims := validClaims()
		past := time.Now().UTC().Add(-time.Hour)
		claims.ExpiresAt = jwt.NewNumericDate(past)
		token := signClaims(t, claims)

		if _, err := svc.ValidateAccessToken(token); err == nil {
			t.Error("ValidateAccessToken: expected error for expired token, got nil")
		}
	})

	t.Run("wrong issuer", func(t *testing.T) {
		claims := validClaims()
		claims.Issuer = "wrong"
		token := signClaims(t, claims)

		if _, err := svc.ValidateAccessToken(token); err == nil {
			t.Error("ValidateAccessToken: expected error for wrong issuer, got nil")
		}
	})

	t.Run("wrong audience", func(t *testing.T) {
		claims := validClaims()
		claims.Audience = jwt.ClaimStrings{"wrong"}
		token := signClaims(t, claims)

		if _, err := svc.ValidateAccessToken(token); err == nil {
			t.Error("ValidateAccessToken: expected error for wrong audience, got nil")
		}
	})

	t.Run("wrong token type", func(t *testing.T) {
		claims := validClaims()
		claims.TokenType = "refresh"
		token := signClaims(t, claims)

		if _, err := svc.ValidateAccessToken(token); err == nil {
			t.Error("ValidateAccessToken: expected error for non-access token type, got nil")
		}
	})

	t.Run("malformed subject", func(t *testing.T) {
		claims := validClaims()
		claims.Subject = "not-a-uuid"
		token := signClaims(t, claims)

		if _, err := svc.ValidateAccessToken(token); err == nil {
			t.Error("ValidateAccessToken: expected error for malformed subject, got nil")
		}
	})

	t.Run("malformed session id", func(t *testing.T) {
		claims := validClaims()
		claims.SessionID = "not-a-uuid"
		token := signClaims(t, claims)

		if _, err := svc.ValidateAccessToken(token); err == nil {
			t.Error("ValidateAccessToken: expected error for malformed session id, got nil")
		}
	})

	t.Run("wrong secret", func(t *testing.T) {
		other, err := NewService("zyxwvutsrqponmlkjihgfedcba000000")
		if err != nil {
			t.Fatalf("NewService: unexpected error: %v", err)
		}

		token, _, err := other.GenerateAccessToken(uuid.New(), uuid.New(), "bob")
		if err != nil {
			t.Fatalf("GenerateAccessToken: unexpected error: %v", err)
		}

		if _, err := svc.ValidateAccessToken(token); err == nil {
			t.Error("ValidateAccessToken: expected error for token signed with a different secret, got nil")
		}
	})
}
