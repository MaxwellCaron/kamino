package vyos

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type ConfigureOperation struct {
	Op   string   `json:"op"`
	Path []string `json:"path"`
}

type responseEnvelope struct {
	Success bool            `json:"success"`
	Data    json.RawMessage `json:"data"`
	Error   json.RawMessage `json:"error"`
}

type Client struct {
	baseURL    string
	apiKey     string
	httpClient *http.Client
}

func NewClient(address, apiKey string, insecure bool) (*Client, error) {
	baseURL, err := normalizeBaseURL(address)
	if err != nil {
		return nil, err
	}
	apiKey = strings.TrimSpace(apiKey)
	if apiKey == "" {
		return nil, fmt.Errorf("VyOS API key is required")
	}

	transport := http.DefaultTransport.(*http.Transport).Clone()
	if insecure {
		transport.TLSClientConfig = &tls.Config{InsecureSkipVerify: true}
	}

	return &Client{
		baseURL:    baseURL,
		apiKey:     apiKey,
		httpClient: &http.Client{Transport: transport},
	}, nil
}

func normalizeBaseURL(address string) (string, error) {
	trimmed := strings.TrimSpace(address)
	if trimmed == "" {
		return "", fmt.Errorf("VyOS API address is required")
	}
	if !strings.Contains(trimmed, "://") {
		trimmed = "https://" + trimmed
	}

	parsed, err := url.Parse(trimmed)
	if err != nil {
		return "", fmt.Errorf("parse VyOS API address: %w", err)
	}
	if parsed.Scheme != "https" {
		return "", fmt.Errorf("VyOS API address must use https")
	}
	if parsed.Host == "" {
		return "", fmt.Errorf("VyOS API host is required")
	}

	return strings.TrimRight(parsed.String(), "/"), nil
}

func (c *Client) Ready(ctx context.Context) error {
	_, err := c.post(ctx, "/retrieve", map[string]any{
		"op":   "showConfig",
		"path": []string{},
	})
	if err != nil {
		return fmt.Errorf("retrieve readiness probe: %w", err)
	}
	return nil
}

func (c *Client) Configure(ctx context.Context, operations ...ConfigureOperation) error {
	if len(operations) == 0 {
		return fmt.Errorf("at least one configure operation is required")
	}

	var payload any
	if len(operations) == 1 {
		payload = operations[0]
	} else {
		payload = operations
	}

	_, err := c.post(ctx, "/configure", payload)
	if err != nil {
		return fmt.Errorf("configure router: %w", err)
	}
	return nil
}

func (c *Client) Save(ctx context.Context) error {
	_, err := c.post(ctx, "/config-file", map[string]string{"op": "save"})
	if err != nil {
		return fmt.Errorf("save router config: %w", err)
	}
	return nil
}

func (c *Client) WaitForReady(ctx context.Context, timeout time.Duration) error {
	if timeout <= 0 {
		return fmt.Errorf("timeout must be positive")
	}

	waitCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	backoff := 250 * time.Millisecond
	for {
		if err := c.Ready(waitCtx); err == nil {
			return nil
		}

		select {
		case <-waitCtx.Done():
			return fmt.Errorf("waiting for VyOS API readiness: %w", waitCtx.Err())
		case <-time.After(backoff):
		}

		if backoff < 2*time.Second {
			backoff *= 2
			if backoff > 2*time.Second {
				backoff = 2 * time.Second
			}
		}
	}
}

func (c *Client) post(ctx context.Context, endpoint string, payload any) (*responseEnvelope, error) {
	data, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("marshal %s payload: %w", endpoint, err)
	}

	form := url.Values{}
	form.Set("key", c.apiKey)
	form.Set("data", string(data))

	req, err := http.NewRequestWithContext(
		ctx,
		http.MethodPost,
		c.baseURL+endpoint,
		strings.NewReader(form.Encode()),
	)
	if err != nil {
		return nil, fmt.Errorf("create %s request: %w", endpoint, err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("execute %s request: %w", endpoint, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, readErr := io.ReadAll(io.LimitReader(resp.Body, 4096))
		if readErr != nil {
			return nil, fmt.Errorf("%s returned status %d (read body: %w)", endpoint, resp.StatusCode, readErr)
		}
		return nil, fmt.Errorf("%s returned status %d: %s", endpoint, resp.StatusCode, strings.TrimSpace(string(body)))
	}

	var envelope responseEnvelope
	if err := json.NewDecoder(resp.Body).Decode(&envelope); err != nil {
		return nil, fmt.Errorf("decode %s response: %w", endpoint, err)
	}

	if apiError := apiErrorString(envelope.Error); apiError != "" {
		return nil, fmt.Errorf("%s returned API error: %s", endpoint, apiError)
	}
	if !envelope.Success {
		return nil, fmt.Errorf("%s returned success=false", endpoint)
	}

	return &envelope, nil
}

func apiErrorString(raw json.RawMessage) string {
	trimmed := strings.TrimSpace(string(raw))
	if trimmed == "" || trimmed == "null" {
		return ""
	}

	var message string
	if err := json.Unmarshal(raw, &message); err == nil {
		return strings.TrimSpace(message)
	}

	return trimmed
}
