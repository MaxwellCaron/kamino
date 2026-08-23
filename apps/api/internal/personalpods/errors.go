package personalpods

// Kind classifies an Error so callers can map it to a transport status code.
type Kind string

const (
	KindDisabled   Kind = "disabled"
	KindConflict   Kind = "conflict"
	KindNotFound   Kind = "not_found"
	KindValidation Kind = "validation"
	KindUpstream   Kind = "upstream"
	KindInternal   Kind = "internal"
)

type Error struct {
	Kind        Kind
	UserMessage string
	Operation   string
	Err         error
}

func (e *Error) Error() string {
	if e == nil {
		return ""
	}
	return e.UserMessage
}

func (e *Error) Unwrap() error {
	if e == nil {
		return nil
	}
	return e.Err
}

func newError(kind Kind, message string) *Error {
	return &Error{Kind: kind, UserMessage: message}
}

func wrapError(kind Kind, message, operation string, err error) *Error {
	return &Error{Kind: kind, UserMessage: message, Operation: operation, Err: err}
}
