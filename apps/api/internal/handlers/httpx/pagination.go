package httpx

import (
	"strconv"

	"github.com/gin-gonic/gin"
)

// allowedTableRowCounts are the row-per-page options exposed by the shared
// DataTable rows-per-page selector. Audit and request table endpoints only
// accept these values.
var allowedTableRowCounts = map[int]bool{
	10: true,
	20: true,
	25: true,
	30: true,
	40: true,
	50: true,
}

// parsePageParam parses a one-based page query parameter. Missing values
// default to 1. Invalid or out-of-range values are rejected.
func ParsePageParam(raw string) (int32, bool) {
	if raw == "" {
		return 1, true
	}
	parsed, err := strconv.Atoi(raw)
	if err != nil || parsed < 1 {
		return 0, false
	}
	return int32(parsed), true
}

// parseRowsParam parses a rows-per-page query parameter against the allowed
// table row options. Missing values default to 25.
func ParseRowsParam(raw string) (int32, bool) {
	if raw == "" {
		return 25, true
	}
	parsed, err := strconv.Atoi(raw)
	if err != nil || !allowedTableRowCounts[parsed] {
		return 0, false
	}
	return int32(parsed), true
}

// parseTableParams parses the shared page/rows query contract used by
// request table endpoints. On invalid input it writes a 400 response and
// returns ok=false.
func ParseTableParams(c *gin.Context) (page int32, rows int32, ok bool) {
	page, ok = ParsePageParam(c.Query("page"))
	if !ok {
		WriteInvalidRequest(c, "invalid page")
		return 0, 0, false
	}

	rows, ok = ParseRowsParam(c.Query("rows"))
	if !ok {
		WriteInvalidRequest(c, "invalid rows")
		return 0, 0, false
	}

	return page, rows, true
}
