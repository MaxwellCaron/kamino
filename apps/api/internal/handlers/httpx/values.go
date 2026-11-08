package httpx

import (
	"time"

	"github.com/jackc/pgx/v5/pgtype"
)

func DerefString(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func OptionalTime(value pgtype.Timestamptz) *time.Time {
	if !value.Valid {
		return nil
	}

	timestamp := value.Time
	return &timestamp
}
