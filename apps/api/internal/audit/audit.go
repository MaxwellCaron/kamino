package audit

import (
	"context"
	"encoding/json"
	"log"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

type Service struct {
	db database.DBTX
}

func NewService(db database.DBTX) *Service {
	return &Service{db: db}
}

type EventParams struct {
	ActorPrincipalID *uuid.UUID
	ActionKind       string
	TargetKind       string
	InventoryItemID  *uuid.UUID
	PodID            *uuid.UUID
	Status           string
	ErrorMessage     *string
	Metadata         map[string]any
}

func (s *Service) Record(ctx context.Context, params EventParams) {
	var metadataBytes []byte
	if params.Metadata != nil {
		var err error
		metadataBytes, err = json.Marshal(params.Metadata)
		if err != nil {
			log.Printf("audit: failed to marshal metadata: %v", err)
			metadataBytes = []byte("{}")
		}
	} else {
		metadataBytes = []byte("{}")
	}

	_, err := database.New(s.db).InsertActionEvent(ctx, database.InsertActionEventParams{
		ActorPrincipalID: params.ActorPrincipalID,
		ActionKind:       params.ActionKind,
		TargetKind:       params.TargetKind,
		InventoryItemID:  params.InventoryItemID,
		PodID:            params.PodID,
		Status:           params.Status,
		ErrorMessage:     params.ErrorMessage,
		Metadata:         metadataBytes,
	})
	if err != nil {
		log.Printf("audit: failed to record action event: %v", err)
	}
}

func (s *Service) RecordSuccess(ctx context.Context, params EventParams) {
	params.Status = "succeeded"
	s.Record(ctx, params)
}

func (s *Service) RecordFailure(ctx context.Context, params EventParams, errMsg string) {
	params.Status = "failed"
	params.ErrorMessage = &errMsg
	s.Record(ctx, params)
}

type ListParams struct {
	CursorID        *int64
	CursorCreatedAt *pgtype.Timestamptz
	PageSize        int32
}

type ListResult struct {
	Items      []database.ListActionEventsPaginatedRow
	NextCursor *int64
	Total      int32
}

func (s *Service) List(ctx context.Context, params ListParams) (ListResult, error) {
	q := database.New(s.db)

	var cursorTS pgtype.Timestamptz
	var cursorID int64
	if params.CursorCreatedAt != nil {
		cursorTS = *params.CursorCreatedAt
	}
	if params.CursorID != nil {
		cursorID = *params.CursorID
	}

	pageSize := params.PageSize
	if pageSize <= 0 || pageSize > 100 {
		pageSize = 50
	}

	rows, err := q.ListActionEventsPaginated(ctx, database.ListActionEventsPaginatedParams{
		CursorCreatedAt: cursorTS,
		CursorID:        cursorID,
		PageSize:        pageSize,
	})
	if err != nil {
		return ListResult{}, err
	}

	total, err := q.CountActionEvents(ctx)
	if err != nil {
		return ListResult{}, err
	}

	result := ListResult{
		Items: rows,
		Total: total,
	}

	if len(rows) == int(pageSize) {
		last := rows[len(rows)-1]
		result.NextCursor = &last.ID
	}

	return result, nil
}
