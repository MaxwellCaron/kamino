package podprogress

const (
	PublishEventType = "pod.publish.progress"

	PublishStepValidating = 1
	PublishStepPreparing  = 2
	PublishStepCloning    = 3
	PublishStepSaving     = 4
)

func (p *Tracker) PublishReporter(id string) *Reporter {
	return p.publish.reporter(id, "", PublishEventType, PublishStepValidating, PublishStepSaving)
}
