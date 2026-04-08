package inventory

import (
	"context"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Service struct {
	db *pgxpool.Pool
}

func NewService(db *pgxpool.Pool) *Service {
	return &Service{db: db}
}

func (s *Service) GetAllInventoryItems(ctx context.Context) ([]database.GetAllInventoryItemsRow, error) {
	return database.New(s.db).GetAllInventoryItems(ctx)
}

func (s *Service) GetInventoryItemByID(ctx context.Context, id uuid.UUID) (database.GetInventoryItemByIDRow, error) {
	return database.New(s.db).GetInventoryItemByID(ctx, id)
}

func (s *Service) DeleteInventoryItemByProxmoxVM(ctx context.Context, node string, vmid int32) error {
	return database.New(s.db).DeleteInventoryItemByProxmoxVM(ctx, database.DeleteInventoryItemByProxmoxVMParams{
		Node: node,
		Vmid: vmid,
	})
}

func (s *Service) UpdateInventoryItemNameByProxmoxVM(ctx context.Context, node string, vmid int32, name string) error {
	return database.New(s.db).UpdateInventoryItemNameByProxmoxVM(ctx, database.UpdateInventoryItemNameByProxmoxVMParams{
		Name: name,
		Node: node,
		Vmid: vmid,
	})
}

func (s *Service) UpdateProxmoxVMIsTemplate(ctx context.Context, node string, vmid int32) error {
	return database.New(s.db).UpdateProxmoxVMIsTemplate(ctx, database.UpdateProxmoxVMIsTemplateParams{
		Node: node,
		Vmid: vmid,
	})
}
