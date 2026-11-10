package handlertest

import (
	"context"
	"sync"

	"github.com/google/uuid"
)

type FakeLiveSessionValidator struct {
	mu  sync.Mutex
	Err error
}

func (f *FakeLiveSessionValidator) ValidateLiveSession(_ context.Context, _, _ uuid.UUID) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.Err
}

func (f *FakeLiveSessionValidator) SetErr(err error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.Err = err
}
