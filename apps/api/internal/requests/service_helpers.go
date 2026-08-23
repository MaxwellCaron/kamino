package requests

import (
	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/MaxwellCaron/kamino/internal/vmactions"
	"github.com/google/uuid"
)

func requestChangedEvent(
	requestID uuid.UUID,
	requesterPrincipalID uuid.UUID,
	kind string,
) Event {
	return Event{
		RequestID:            &requestID,
		RequesterPrincipalID: &requesterPrincipalID,
		Kind:                 kind,
	}
}

func requiredPermissionForRequestKind(kind string) (authorization.Mask, error) {
	switch kind {
	case RequestKindInventoryVMPower:
		return authorization.PowerVM, nil
	case RequestKindInventoryVMSnapshotCreate, RequestKindInventoryVMSnapshotRollback:
		return authorization.SnapshotVM, nil
	default:
		return 0, ErrRequestUnsupportedKind
	}
}

func isValidPowerAction(action database.InventoryRequestPowerAction) bool {
	switch action {
	case database.InventoryRequestPowerActionPowerOn,
		database.InventoryRequestPowerActionShutdown,
		database.InventoryRequestPowerActionReboot,
		database.InventoryRequestPowerActionStop:
		return true
	default:
		return false
	}
}

func invalidPowerAction() database.NullInventoryRequestPowerAction {
	return database.NullInventoryRequestPowerAction{}
}

func validPowerAction(action database.InventoryRequestPowerAction) database.NullInventoryRequestPowerAction {
	return database.NullInventoryRequestPowerAction{
		InventoryRequestPowerAction: action,
		Valid:                       true,
	}
}

func invalidRequestStatus() database.NullRequestStatus {
	return database.NullRequestStatus{}
}

func validRequestStatus(status database.RequestStatus) database.NullRequestStatus {
	return database.NullRequestStatus{
		RequestStatus: status,
		Valid:         true,
	}
}

func powerActionForRequest(action database.InventoryRequestPowerAction) vmactions.PowerAction {
	switch action {
	case database.InventoryRequestPowerActionPowerOn:
		return vmactions.PowerActionStart
	case database.InventoryRequestPowerActionShutdown:
		return vmactions.PowerActionShutdown
	case database.InventoryRequestPowerActionReboot:
		return vmactions.PowerActionReboot
	case database.InventoryRequestPowerActionStop:
		return vmactions.PowerActionStop
	default:
		return ""
	}
}

func toActionTarget(target vmTarget) vmactions.Target {
	return vmactions.Target{
		ItemID:    target.ItemID,
		Node:      target.Node,
		VMID:      target.VMID,
		GuestType: target.GuestType,
	}
}
