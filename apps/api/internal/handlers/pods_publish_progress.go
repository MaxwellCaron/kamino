package handlers

const (
	publishProgressEventType = "pod.publish.progress"

	publishProgressStepValidating = 1
	publishProgressStepPreparing  = 2
	publishProgressStepCloning    = 3
	publishProgressStepSaving     = 4
)

func (p *PodProgress) publishReporter(id string) *podProgressReporter {
	return p.publish.reporter(id, "", publishProgressEventType, publishProgressStepValidating, publishProgressStepSaving)
}
