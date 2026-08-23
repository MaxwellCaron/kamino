package handlers

import (
	"fmt"
	"strings"
	"time"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/names"
	"github.com/MaxwellCaron/kamino/internal/principals"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgtype"
)

func currentUsername(c *gin.Context) (string, bool) {
	value, ok := c.Get("username")
	if !ok {
		return "", false
	}
	username, ok := value.(string)
	username = strings.TrimSpace(username)
	return username, ok && username != ""
}

func cloneOwnerFromPrincipal(row database.ListPrincipalDetailsByIDsRow) publishedPodCloneOwnerResponse {
	label := principals.FormatReference(row.Name, row.FullName, row.ExternalID)
	description := row.ExternalID
	if row.Description != nil && strings.TrimSpace(*row.Description) != "" {
		description = *row.Description
	}
	return publishedPodCloneOwnerResponse{
		ID:          row.ID,
		Type:        string(row.PrincipalType),
		Label:       label,
		Description: description,
	}
}

func managerCloneFolderName(displayLabel string) (string, error) {
	const maxLen = 63

	name := names.Normalize(displayLabel)
	if err := names.ValidateFolder(name); err == nil {
		return name, nil
	}

	folderName := sanitizeFolderNameString(name)
	if folderName == "" {
		return "", fmt.Errorf("principal cannot be used as a pod folder name")
	}
	if len(folderName) > maxLen {
		folderName = strings.TrimRight(folderName[:maxLen], "-")
	}
	if err := names.ValidateFolder(folderName); err != nil {
		return "", fmt.Errorf("principal cannot be used as a pod folder name")
	}
	return folderName, nil
}

func sanitizeFolderNameString(input string) string {
	var builder strings.Builder
	lastDash := false
	for _, r := range input {
		isAllowed := (r >= 'A' && r <= 'Z') || (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9')
		if isAllowed {
			builder.WriteRune(r)
			lastDash = false
			continue
		}
		if builder.Len() > 0 && !lastDash {
			builder.WriteByte('-')
			lastDash = true
		}
	}
	return strings.Trim(builder.String(), "-")
}

func cloneFolderName(username string) (string, error) {
	name := names.Normalize(username)
	if len(name) > 0 && name[0] >= '0' && name[0] <= '9' {
		name = "User-" + name
	}
	if err := names.ValidateFolder(name); err == nil {
		return name, nil
	}

	folderName := sanitizeFolderNameString(name)
	if folderName == "" {
		return "", fmt.Errorf("username cannot be used as a pod folder name")
	}
	if folderName[0] >= '0' && folderName[0] <= '9' {
		folderName = "User-" + folderName
	}
	if len(folderName) > 63 {
		folderName = strings.TrimRight(folderName[:63], "-")
	}
	if err := names.ValidateFolder(folderName); err != nil {
		return "", err
	}

	return folderName, nil
}

func answersMatch(answer, expected string) bool {
	return strings.EqualFold(strings.TrimSpace(answer), strings.TrimSpace(expected))
}

func pgTime(value pgtype.Timestamptz) time.Time {
	if !value.Valid {
		return time.Time{}
	}
	return value.Time
}

func uniqueInts(values []int) map[int]struct{} {
	unique := make(map[int]struct{}, len(values))
	for _, value := range values {
		unique[value] = struct{}{}
	}
	return unique
}
