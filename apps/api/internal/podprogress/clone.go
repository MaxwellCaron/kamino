package podprogress

const (
	CloneEventType    = "pod.clone.progress"
	CloneStepFetching = 1
	CloneStepCloning  = 2
	CloneStepWaiting  = 3
	CloneStepRouter   = 4
)

func (p *Tracker) CloneReporter(id, batchID string) *Reporter {
	return p.clone.reporter(id, batchID, CloneEventType, CloneStepFetching, CloneStepRouter)
}
