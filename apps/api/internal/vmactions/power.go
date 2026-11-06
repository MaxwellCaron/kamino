package vmactions

func (action PowerAction) ExpectedStatus() string {
	switch action {
	case PowerActionStart, PowerActionReboot:
		return "running"
	default:
		return "stopped"
	}
}

func (action PowerAction) CanSkipForStatus(status string) bool {
	switch action {
	case PowerActionStart:
		return status == "running"
	case PowerActionShutdown:
		return status != "" && status != "running"
	default:
		return false
	}
}
