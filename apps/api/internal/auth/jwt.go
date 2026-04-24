package auth

import (
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

const (
	AccessTokenDuration  = 15 * time.Minute
	RefreshTokenDuration = 7 * 24 * time.Hour

	AccessCookieName  = "access_token"
	RefreshCookieName = "refresh_token"

	accessTokenType = "access"
	jwtIssuer       = "kamino"
	jwtAudience     = "kamino-api"
)

// Claims holds the custom JWT claims for a Kamino access token.
type Claims struct {
	jwt.RegisteredClaims
	TokenType string `json:"typ"`
	SessionID string `json:"sid"`
	Username  string `json:"usr"`
}

func (c *Claims) PrincipalID() (uuid.UUID, error) {
	return uuid.Parse(c.Subject)
}

func (c *Claims) SessionIDParsed() (uuid.UUID, error) {
	return uuid.Parse(c.SessionID)
}

// Service handles access JWT creation and validation.
type Service struct {
	secret []byte
}

// NewService creates a new auth service with the given signing secret.
func NewService(secret string) (*Service, error) {
	if len(secret) < 32 {
		return nil, fmt.Errorf("JWT_SECRET must be at least 32 characters")
	}

	return &Service{secret: []byte(secret)}, nil
}

// GenerateAccessToken creates a new signed access token for the given session.
func (s *Service) GenerateAccessToken(
	principalID uuid.UUID,
	sessionID uuid.UUID,
	username string,
) (token string, expiresAt time.Time, err error) {
	now := time.Now().UTC()
	expiresAt = now.Add(AccessTokenDuration)

	claims := Claims{
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   principalID.String(),
			IssuedAt:  jwt.NewNumericDate(now),
			NotBefore: jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(expiresAt),
			Issuer:    jwtIssuer,
			Audience:  jwt.ClaimStrings{jwtAudience},
		},
		TokenType: accessTokenType,
		SessionID: sessionID.String(),
		Username:  username,
	}

	signed, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(s.secret)
	if err != nil {
		return "", time.Time{}, fmt.Errorf("sign access token: %w", err)
	}

	return signed, expiresAt, nil
}

// ValidateAccessToken parses and validates an access JWT string.
func (s *Service) ValidateAccessToken(tokenStr string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(
		tokenStr,
		&Claims{},
		func(t *jwt.Token) (any, error) {
			return s.secret, nil
		},
		jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}),
		jwt.WithIssuer(jwtIssuer),
		jwt.WithAudience(jwtAudience),
	)
	if err != nil {
		return nil, err
	}

	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid {
		return nil, fmt.Errorf("invalid token claims")
	}
	if claims.TokenType != accessTokenType {
		return nil, fmt.Errorf("invalid token type")
	}
	if _, err := claims.PrincipalID(); err != nil {
		return nil, fmt.Errorf("invalid token subject: %w", err)
	}
	if _, err := claims.SessionIDParsed(); err != nil {
		return nil, fmt.Errorf("invalid token session: %w", err)
	}

	return claims, nil
}
