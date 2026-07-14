package proxmox

import "net/http/httptest"

// NewHTTPTestClient wires a Client to an httptest.Server. It is intended for tests.
func NewHTTPTestClient(server *httptest.Server) *Client {
	return &Client{
		baseURL: server.URL,
		tokenID: "token",
		secret:  "secret",
		nodes:   []string{"node1"},
		nodeIndex: map[string]int{
			"node1": 0,
		},
		httpClient: server.Client(),
	}
}
