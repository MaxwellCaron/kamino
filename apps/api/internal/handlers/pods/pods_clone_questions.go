package pods

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/handlers/httpx"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

func buildPrincipalPodQuestionAnswerParams(
	principalID uuid.UUID,
	clone database.ClonedPods,
	question database.GetQuestionForClonedPodRow,
	answer string,
	isCorrect bool,
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
		Answer:           answer,
		IsCorrect:        isCorrect,
	}
}

// buildPodProgressResponse derives task completion from the principal's answers.
// A task is complete once every question in it is answered correctly; tasks
// without questions are always complete.
func buildPodProgressResponse(
	tasks []database.ListPublishedPodTasksByPodIDsRow,
	questions []database.ListPublishedPodQuestionsByTaskIDsRow,
	answers []database.ListPrincipalPodQuestionAnswersRow,
) podProgressResponse {
	answerResponses := make([]podQuestionAnswerResponse, 0, len(answers))
	correctAt := make(map[uuid.UUID]time.Time, len(answers))
	for _, row := range answers {
		answeredAt := pgTime(row.AnsweredAt)
		answerResponses = append(answerResponses, podQuestionAnswerResponse{
			QuestionID: row.QuestionID,
			Answer:     row.Answer,
			IsCorrect:  row.IsCorrect,
			AnsweredAt: answeredAt,
		})
		if row.IsCorrect {
			correctAt[row.QuestionID] = answeredAt
		}
	}

	questionsByTask := make(map[uuid.UUID][]uuid.UUID, len(tasks))
	for _, question := range questions {
		questionsByTask[question.TaskID] = append(questionsByTask[question.TaskID], question.ID)
	}

	var answered int32
	taskStates := make([]podTaskStateResponse, 0, len(tasks))
	for _, task := range tasks {
		state := podTaskStateResponse{TaskID: task.ID, Completed: true}
		var completedAt time.Time
		for _, questionID := range questionsByTask[task.ID] {
			at, ok := correctAt[questionID]
			if !ok {
				state.Completed = false
				continue
			}
			answered++
			if at.After(completedAt) {
				completedAt = at
			}
		}
		if state.Completed && !completedAt.IsZero() {
			state.CompletedAt = &completedAt
		}
		taskStates = append(taskStates, state)
	}

	return podProgressResponse{
		QuestionSummary: newPodQuestionSummaryResponse(int32(len(questions)), answered),
		TaskStates:      taskStates,
		QuestionAnswers: answerResponses,
	}
}

func (h *PodsHandler) loadPodProgress(
	ctx context.Context,
	q *database.Queries,
	principalID uuid.UUID,
	podID uuid.UUID,
) (podProgressResponse, error) {
	tasks, err := q.ListPublishedPodTasksByPodIDs(ctx, []uuid.UUID{podID})
	if err != nil {
		return podProgressResponse{}, err
	}

	var questions []database.ListPublishedPodQuestionsByTaskIDsRow
	if len(tasks) > 0 {
		taskIDs := make([]uuid.UUID, 0, len(tasks))
		for _, task := range tasks {
			taskIDs = append(taskIDs, task.ID)
		}
		questions, err = q.ListPublishedPodQuestionsByTaskIDs(ctx, taskIDs)
		if err != nil {
			return podProgressResponse{}, err
		}
	}

	answers, err := q.ListPrincipalPodQuestionAnswers(ctx, database.ListPrincipalPodQuestionAnswersParams{
		PrincipalID: principalID,
		PodID:       podID,
	})
	if err != nil {
		return podProgressResponse{}, err
	}

	return buildPodProgressResponse(tasks, questions, answers), nil
}

func (h *PodsHandler) GetCatalogPodProgress(c *gin.Context) {
	principalID, ok := httpx.CurrentPrincipalID(c)
	if !ok {
		httpx.WriteUnauthorized(c)
		return
	}

	pod, reqErr := h.visibleCatalogPodBySlug(c.Request.Context(), principalID, c.Param("slug"))
	if reqErr != nil {
		httpx.WriteRequestError(c, reqErr)
		return
	}

	progress, err := h.loadPodProgress(c.Request.Context(), database.New(h.DB), principalID, pod.ID)
	if err != nil {
		httpx.WriteLoggedError(c, http.StatusInternalServerError, "failed to load pod progress", "load catalog pod progress", err)
		return
	}

	c.JSON(http.StatusOK, progress)
}

func (h *PodsHandler) AnswerClonedPodQuestion(c *gin.Context) {
	principalID, ok := httpx.CurrentPrincipalID(c)
	if !ok {
		httpx.WriteUnauthorized(c)
		return
	}

	cloneID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		httpx.WriteInvalidRequest(c, "invalid id")
		return
	}
	questionID, err := uuid.Parse(c.Param("questionID"))
	if err != nil {
		httpx.WriteInvalidRequest(c, "invalid question id")
		return
	}

	var req answerPodQuestionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		httpx.WriteInvalidRequest(c, "invalid request body")
		return
	}
	answer := strings.TrimSpace(req.Answer)
	if answer == "" || len(answer) > publishPodQuestionTextMaxLength {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": "answer must be between 1 and 256 characters"})
		return
	}

	ctx := c.Request.Context()
	q := database.New(h.DB)
	clone, reqErr := h.loadAccessibleClonedPod(ctx, q, principalID, cloneID)
	if reqErr != nil {
		httpx.WriteRequestError(c, reqErr)
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
		httpx.WriteLoggedError(c, http.StatusInternalServerError, "failed to load question", "load cloned pod question", err)
		return
	}

	isCorrect := answersMatch(answer, question.AnswerOutline)
	if err := q.UpsertPrincipalPodQuestionAnswer(
		ctx,
		buildPrincipalPodQuestionAnswerParams(principalID, clone, question, answer, isCorrect),
	); err != nil {
		httpx.WriteLoggedError(c, http.StatusInternalServerError, "failed to save answer", "upsert principal pod question answer", err)
		return
	}

	progress, err := h.loadPodProgress(ctx, q, principalID, clone.PodID)
	if err != nil {
		httpx.WriteLoggedError(c, http.StatusInternalServerError, "failed to load pod progress", "load pod progress after answer", err)
		return
	}

	c.JSON(http.StatusOK, progress)
}

func (h *PodsHandler) ListPodQuestionActivity(c *gin.Context) {
	principalID, ok := httpx.CurrentPrincipalID(c)
	if !ok {
		httpx.WriteUnauthorized(c)
		return
	}

	q := database.New(h.DB)
	rows, err := q.ListPrincipalCorrectPodQuestionAnswers(c.Request.Context(), principalID)
	if err != nil {
		httpx.WriteLoggedError(c, http.StatusInternalServerError, "failed to load question activity", "list principal correct pod question answers", err)
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
