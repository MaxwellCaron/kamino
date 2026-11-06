package handlers

const (
	createProgressEventType       = "pod.create.progress"
	createProgressStepValidating  = 1
	createProgressStepFolders     = 2
	createProgressStepNetwork     = 3
	createProgressStepCloning     = 4
	createProgressStepWaiting     = 5
	createProgressStepConfiguring = 6
	createProgressStepRouter      = 7
)

func (p *PodProgress) createReporter(id string) *podProgressReporter {
	return p.create.reporter(id, "", createProgressEventType, createProgressStepValidating, 0)
}
