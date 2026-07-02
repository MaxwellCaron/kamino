package audit

import (
	"context"
	"encoding/json"
	"log"
	"time"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/google/uuid"
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
	Page   int32
	Rows   int32
	Search string
}

type ListResult struct {
	Items []database.ListActionEventsPaginatedRow
	Total int32
	Page  int32
	Rows  int32
}

// normalizeListParams applies the page=1/rows=25 defaults shared by audit
// table consumers and computes the corresponding row offset.
func normalizeListParams(params ListParams) (page int32, rows int32, offset int32) {
	page = params.Page
	if page <= 0 {
		page = 1
	}
	rows = params.Rows
	if rows <= 0 {
		rows = 25
	}
	offset = (page - 1) * rows
	return page, rows, offset
}

func (s *Service) DeleteOldEvents(ctx context.Context) (int64, error) {
	return database.New(s.db).DeleteActionEventsOlderThanRetention(ctx)
}

func (s *Service) StartRetention(ctx context.Context) {
	ticker := time.NewTicker(24 * time.Hour)
	defer ticker.Stop()

	s.runRetentionSweep(ctx)
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.runRetentionSweep(ctx)
		}
	}
}

func (s *Service) runRetentionSweep(ctx context.Context) {
	deleted, err := s.DeleteOldEvents(ctx)
	if err != nil && ctx.Err() == nil {
		log.Printf("audit retention sweep failed: %v", err)
		return
	}
	if deleted > 0 {
		log.Printf("audit retention sweep deleted %d old event(s)", deleted)
	}
}

func (s *Service) List(ctx context.Context, params ListParams) (ListResult, error) {
	q := database.New(s.db)

	page, rows, offset := normalizeListParams(params)

	items, err := q.ListActionEventsPaginated(ctx, database.ListActionEventsPaginatedParams{
		Search:    params.Search,
		Rows:      rows,
		RowOffset: offset,
	})
	if err != nil {
		return ListResult{}, err
	}

	total, err := q.CountActionEventsFiltered(ctx, params.Search)
	if err != nil {
		return ListResult{}, err
	}

	return ListResult{
		Items: items,
		Total: total,
		Page:  page,
		Rows:  rows,
	}, nil
}
