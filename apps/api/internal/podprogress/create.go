package podprogress

const (
	CreateEventType       = "pod.create.progress"
	CreateStepValidating  = 1
	CreateStepFolders     = 2
	CreateStepNetwork     = 3
	CreateStepCloning     = 4
	CreateStepWaiting     = 5
	CreateStepConfiguring = 6
	CreateStepRouter      = 7
)

func (p *Tracker) CreateReporter(id string) *Reporter {
	return p.create.reporter(id, "", CreateEventType, CreateStepValidating, 0)
}
