package handlers

import (
	"errors"
	"net/http"
	"strings"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

func (h *PodsHandler) AnswerClonedPodQuestion(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		writeUnauthorized(c)
		return
	}

	cloneID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		writeInvalidRequest(c, "invalid id")
		return
	}
	questionID, err := uuid.Parse(c.Param("questionID"))
	if err != nil {
		writeInvalidRequest(c, "invalid question id")
		return
	}

	var req answerPodQuestionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeInvalidRequest(c, "invalid request body")
		return
	}
	answer := strings.TrimSpace(req.Answer)
	if answer == "" || len(answer) > publishPodQuestionTextMaxLength {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": "answer must be between 1 and 256 characters"})
		return
	}

	ctx := c.Request.Context()
	tx, err := h.DB.Begin(ctx)
	if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to save answer", "begin cloned pod question answer tx", err)
		return
	}
	defer tx.Rollback(ctx)

	q := database.New(tx)
	clone, reqErr := h.loadAccessibleClonedPod(ctx, q, principalID, cloneID)
	if reqErr != nil {
		writeRequestError(c, reqErr)
		return
	}

	question, err := q.GetQuestionForClonedPod(ctx, database.GetQuestionForClonedPodParams{
		ClonedPodID: cloneID,
		QuestionID:  questionID,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		c.JSON(http.StatusNotFound, gin.H{"error": "question not found"})
		return
	}
	if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to load question", "load cloned pod question", err)
		return
	}

	isCorrect := answersMatch(answer, question.AnswerOutline)
	liveAnswer, err := q.UpsertClonedPodQuestionAnswer(ctx, database.UpsertClonedPodQuestionAnswerParams{
		ClonedPodID: cloneID,
		QuestionID:  question.ID,
		Answer:      answer,
		IsCorrect:   isCorrect,
	})
	if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to save answer", "upsert cloned pod question answer", err)
		return
	}

	if _, err := q.UpsertPrincipalPodQuestionAnswer(
		ctx,
		buildPrincipalPodQuestionAnswerParams(principalID, clone, question, liveAnswer),
	); err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to save answer", "upsert principal pod question answer", err)
		return
	}

	remaining, err := q.CountIncorrectOrUnansweredTaskQuestions(ctx, database.CountIncorrectOrUnansweredTaskQuestionsParams{
		ClonedPodID: cloneID,
		TaskID:      question.TaskID,
	})
	if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to update task progress", "count cloned pod task questions", err)
		return
	}
	if err := q.SetClonedPodTaskCompleted(ctx, database.SetClonedPodTaskCompletedParams{
		ClonedPodID: cloneID,
		TaskID:      question.TaskID,
		Completed:   remaining == 0,
	}); err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to update task progress", "set cloned pod task completion", err)
		return
	}

	if err := tx.Commit(ctx); err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to save answer", "commit cloned pod question answer tx", err)
		return
	}

	q = database.New(h.DB)
	response, err := h.hydrateClonedPod(c.Request.Context(), q, principalID, clone)
	if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to load cloned pod details", "hydrate cloned pod after answer", err)
		return
	}

	c.JSON(http.StatusOK, response)
}

func (h *PodsHandler) ListPodQuestionActivity(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		writeUnauthorized(c)
		return
	}

	q := database.New(h.DB)
	rows, err := q.ListPrincipalCorrectPodQuestionAnswers(c.Request.Context(), principalID)
	if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to load question activity", "list principal correct pod question answers", err)
		return
	}

	response := make([]podQuestionActivityResponse, 0, len(rows))
	for _, row := range rows {
		response = append(response, podQuestionActivityResponse{
			PodID:      row.SourcePodID,
			QuestionID: row.SourceQuestionID,
			AnsweredAt: pgTime(row.AnsweredAt),
		})
	}

	c.JSON(http.StatusOK, response)
}

func buildPrincipalPodQuestionAnswerParams(
	principalID uuid.UUID,
	clone database.ClonedPods,
	question database.GetQuestionForClonedPodRow,
	answer database.UpsertClonedPodQuestionAnswerRow,
) database.UpsertPrincipalPodQuestionAnswerParams {
	return database.UpsertPrincipalPodQuestionAnswerParams{
		PrincipalID:      principalID,
		SourcePodID:      question.PodID,
		SourceTaskID:     question.TaskID,
		SourceQuestionID: question.ID,
		LastClonedPodID:  &clone.ID,
		PodSlug:          question.PodSlug,
		PodTitle:         question.PodTitle,
		TaskTitle:        question.TaskTitle,
		QuestionTitle:    question.Title,
		Answer:           answer.Answer,
		IsCorrect:        answer.IsCorrect,
		AnsweredAt:       answer.AnsweredAt,
	}
}
