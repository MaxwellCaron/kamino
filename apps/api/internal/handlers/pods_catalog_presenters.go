package handlers

import (
	"strings"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/principals"
	"github.com/google/uuid"
)

func publishedVMFromRow(row database.ListPublishedPodVMsByPodIDsRow) publishedPodVMResponse {
	return publishedPodVMResponse{
		ID:         row.SourceInventoryItemID,
		Name:       row.Name,
		CPUCount:   row.CpuCount,
		MemoryGB:   memoryMBToGB(&row.MemoryMb),
		StorageGB:  diskGBToInt(&row.DiskGb),
		IsRouter:   row.IsRouter,
		SegmentKey: row.SegmentKey,
		Permissions: publishedPodPermissionResponse{
			AllowMask: row.AllowMask,
			DenyMask:  row.DenyMask,
		},
	}
}

func publishedQuestionFromRow(row database.ListPublishedPodQuestionsByTaskIDsRow) publishedPodQuestionResponse {
	return publishedPodQuestionResponse{
		ID:            row.ID,
		Title:         row.Title,
		AnswerOutline: row.AnswerOutline,
		Description:   row.Description,
		Hint:          row.Hint,
	}
}

func publishedPrincipalFromCreator(row database.ListPublishedPodCreatorsByPodIDsRow) publishedPodPrincipalResponse {
	return publishedPrincipal(row.ID, row.PrincipalType, row.ExternalID, row.Name, row.FullName, row.Description)
}

func publishedPrincipalFromAudience(row database.ListPublishedPodAudienceByPodIDsRow) publishedPodPrincipalResponse {
	return publishedPrincipal(row.ID, row.PrincipalType, row.ExternalID, row.Name, row.FullName, row.Description)
}

func publishedPrincipal(
	id uuid.UUID,
	principalType database.PrincipalType,
	externalID string,
	name *string,
	fullName *string,
	description *string,
) publishedPodPrincipalResponse {
	label := principals.FormatReference(name, fullName, externalID)
	descriptionValue := externalID
	if description != nil && strings.TrimSpace(*description) != "" {
		descriptionValue = *description
	}

	return publishedPodPrincipalResponse{
		ID:          id,
		Type:        string(principalType),
		Label:       label,
		Description: descriptionValue,
	}
}

func listPublishedRowsToBase(rows []database.ListPublishedPodsRow) []publishedPodBase {
	bases := make([]publishedPodBase, 0, len(rows))
	for _, row := range rows {
		bases = append(bases, publishedPodBase{
			ID:                row.ID,
			Title:             row.Title,
			Slug:              row.Slug,
			Description:       row.Description,
			ImageURL:          row.ImageUrl,
			Status:            row.Status,
			SourceFolderID:    row.SourceFolderID,
			NetworkProfileKey: row.NetworkProfileKey,
			CloneCount:        row.CloneCount,
			CreatedAt:         optionalTime(row.CreatedAt),
		})
	}
	return bases
}

func visiblePublishedRowsToBase(rows []database.ListVisiblePublishedPodsForPrincipalRow) []publishedPodBase {
	bases := make([]publishedPodBase, 0, len(rows))
	for _, row := range rows {
		bases = append(bases, publishedPodBase{
			ID:                row.ID,
			Title:             row.Title,
			Slug:              row.Slug,
			Description:       row.Description,
			ImageURL:          row.ImageUrl,
			Status:            row.Status,
			SourceFolderID:    row.SourceFolderID,
			NetworkProfileKey: row.NetworkProfileKey,
			CloneCount:        row.CloneCount,
			CreatedAt:         optionalTime(row.CreatedAt),
		})
	}
	return bases
}

func publishedRowToBase(row database.GetPublishedPodByIDRow) publishedPodBase {
	return publishedPodBase{
		ID:                row.ID,
		Title:             row.Title,
		Slug:              row.Slug,
		Description:       row.Description,
		ImageURL:          row.ImageUrl,
		Status:            row.Status,
		SourceFolderID:    row.SourceFolderID,
		NetworkProfileKey: row.NetworkProfileKey,
		CloneCount:        row.CloneCount,
		CreatedAt:         optionalTime(row.CreatedAt),
	}
}

func visiblePublishedSlugRowToBase(row database.GetVisiblePublishedPodBySlugRow) publishedPodBase {
	return publishedPodBase{
		ID:                row.ID,
		Title:             row.Title,
		Slug:              row.Slug,
		Description:       row.Description,
		ImageURL:          row.ImageUrl,
		Status:            row.Status,
		SourceFolderID:    row.SourceFolderID,
		NetworkProfileKey: row.NetworkProfileKey,
		CloneCount:        row.CloneCount,
		CreatedAt:         optionalTime(row.CreatedAt),
	}
}

func nonNilPrincipals(values []publishedPodPrincipalResponse) []publishedPodPrincipalResponse {
	if values == nil {
		return []publishedPodPrincipalResponse{}
	}
	return values
}

func nonNilVMs(values []publishedPodVMResponse) []publishedPodVMResponse {
	if values == nil {
		return []publishedPodVMResponse{}
	}
	return values
}
