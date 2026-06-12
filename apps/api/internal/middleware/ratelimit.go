package middleware

import (
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

type rlEntry struct {
	count       int
	windowStart time.Time
}

// LoginRateLimit returns a fixed-window rate limiter keyed by client IP.
// Requests exceeding maxAttempts within window receive 429.
func LoginRateLimit(maxAttempts int, window time.Duration) gin.HandlerFunc {
	var mu sync.Mutex
	entries := make(map[string]*rlEntry)

	return func(c *gin.Context) {
		ip := c.ClientIP()
		now := time.Now()

		mu.Lock()
		e, ok := entries[ip]
		if !ok || now.Sub(e.windowStart) >= window {
			entries[ip] = &rlEntry{count: 1, windowStart: now}
			if len(entries) > 1024 {
				for k, v := range entries {
					if now.Sub(v.windowStart) >= window {
						delete(entries, k)
					}
				}
			}
			mu.Unlock()
			c.Next()
			return
		}
		e.count++
		if e.count > maxAttempts {
			mu.Unlock()
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{"error": "too many login attempts, try again later"})
			return
		}
		mu.Unlock()
		c.Next()
	}
}
