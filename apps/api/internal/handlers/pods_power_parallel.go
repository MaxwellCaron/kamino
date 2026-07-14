package handlers

import (
	"context"
	"fmt"

	"github.com/MaxwellCaron/kamino/internal/vmactions"
	"github.com/google/uuid"
)

type podPowerTargetOutcome struct {
	Target      vmactions.Target
	Submitted   bool
	Expected    string
	AlreadyDone bool
	Err         error
	Claimed     bool
}

func (h *PodsHandler) runClaimedPodVMPowerActions(
	ctx context.Context,
	principalID uuid.UUID,
	action vmactions.PowerAction,
	targets []vmactions.Target,
	initialStatuses map[int]string,
) podPowerResultResponse {
	result := podPowerResultResponse{
		Action:    string(action),
		Succeeded: make([]uuid.UUID, 0, len(targets)),
		Failed:    make([]bulkVMActionFailure, 0),
	}
	if h.Actions == nil {
		for _, target := range targets {
			result.Failed = append(result.Failed, bulkVMActionFailure{
				ID:    target.ItemID.String(),
				Error: "vm actions unavailable",
			})
		}
		return result
	}

	expectedStatus := podPowerExpectedStatus(action)
	outcomes := make([]podPowerTargetOutcome, len(targets))
	for index, target := range targets {
		outcome := podPowerTargetOutcome{
			Target:   target,
			Expected: expectedStatus,
		}
		if clonedPodVMAlreadyInPowerState(string(action), initialStatuses[target.VMID]) {
			outcome.AlreadyDone = true
			outcomes[index] = outcome
			continue
		}
		outcomes[index] = outcome
	}

	powerResults := runBoundedPowerActions(ctx, h.Actions.PowerConcurrency(), targets, func(ctx context.Context, index int, target vmactions.Target) error {
		outcome := &outcomes[index]
		if outcome.AlreadyDone {
			return nil
		}
		if h.VMActionClaims == nil {
			outcome.Err = fmt.Errorf("vm action claims unavailable")
			return nil
		}
		if err := h.VMActionClaims.Claim(ctx, target.ItemID, "power_action", principalID, ""); err != nil {
			if vmactions.IsActionInProgress(err) {
				outcome.Err = fmt.Errorf("another action is already in progress for this VM")
				return nil
			}
			outcome.Err = err
			return nil
		}
		outcome.Claimed = true
		defer func() {
			_ = h.VMActionClaims.Release(context.WithoutCancel(ctx), target.ItemID)
		}()

		if err := h.Actions.PowerAction(ctx, target, action); err != nil {
			outcome.Err = err
			return nil
		}
		outcome.Submitted = true
		return nil
	})

	expected := make(map[int]string)
	for index := range outcomes {
		outcome := outcomes[index]
		if outcome.AlreadyDone || outcome.Submitted {
			expected[outcome.Target.VMID] = expectedStatus
		}
		_ = powerResults[index]
	}

	if len(expected) > 0 {
		unconfirmed, waitErr := h.waitForVMStatuses(ctx, expected)
		if waitErr != nil {
			for index, outcome := range outcomes {
				if outcomes[index].AlreadyDone || !outcome.Submitted {
					continue
				}
				outcomes[index].Err = waitErr
			}
		} else {
			for _, vmid := range unconfirmed {
				for index, outcome := range outcomes {
					if outcome.Target.VMID != vmid || outcome.AlreadyDone {
						continue
					}
					outcomes[index].Err = fmt.Errorf("%s failed", action)
				}
			}
		}
	}

	for _, outcome := range outcomes {
		if outcome.AlreadyDone {
			result.Succeeded = append(result.Succeeded, outcome.Target.ItemID)
			continue
		}
		if outcome.Err != nil {
			result.Failed = append(result.Failed, bulkVMActionFailure{
				ID:    outcome.Target.ItemID.String(),
				Error: sanitizePodPowerError(string(action), outcome.Err),
			})
			continue
		}
		if outcome.Submitted {
			result.Succeeded = append(result.Succeeded, outcome.Target.ItemID)
		}
	}

	return result
}

func podPowerExpectedStatus(action vmactions.PowerAction) string {
	switch action {
	case vmactions.PowerActionStart, vmactions.PowerActionReboot:
		return "running"
	default:
		return "stopped"
	}
}

func sanitizePodPowerError(action string, err error) string {
	if err == nil {
		return fmt.Sprintf("%s failed", action)
	}
	if vmactions.IsActionInProgress(err) {
		return "another action is already in progress for this VM"
	}
	message := err.Error()
	if message == "another action is already in progress for this VM" {
		return message
	}
	return fmt.Sprintf("%s failed", action)
}

func cloneFailedFromPowerResult(result podPowerResultResponse) bool {
	return len(result.Failed) > 0
}
