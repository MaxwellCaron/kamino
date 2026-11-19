package httpx

import (
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

func ParseItemIDParam(c *gin.Context) (uuid.UUID, bool) {
	itemID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		WriteInvalidRequest(c, "invalid id")
		return uuid.Nil, false
	}

	return itemID, true
}
