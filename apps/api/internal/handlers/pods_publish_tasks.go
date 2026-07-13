package handlers

import (
	"fmt"
	"strings"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/authorization"
)

func normalizePublishPodTasks(tasks []publishPodTaskRequest) ([]normalizedPublishPodTask, *requestError) {
	if len(tasks) < 1 {
		return nil, invalidPublishPod("add at least one task")
	}
	if len(tasks) > 20 {
		return nil, invalidPublishPod("you can add up to 20 tasks")
	}

	normalized := make([]normalizedPublishPodTask, 0, len(tasks))
	for _, task := range tasks {
		taskID, err := parseOrNewUUID(task.ID)
		if err != nil {
			return nil, invalidPublishPod("invalid task id")
		}
		title := strings.TrimSpace(task.Title)
		if title == "" || len(title) > 64 {
			return nil, invalidPublishPod("task title must be between 1 and 64 characters")
		}
		content := strings.TrimSpace(task.Content)
		if content == "" || len(content) > publishPodTaskContentMaxLength {
			return nil, invalidPublishPod("task content must be between 1 and 4096 characters")
		}

		questions := make([]normalizedPublishPodQuestion, 0, len(task.Questions))
		for _, question := range task.Questions {
			questionID, err := parseOrNewUUID(question.ID)
			if err != nil {
				return nil, invalidPublishPod("invalid question id")
			}
			questionTitle := strings.TrimSpace(question.Title)
			answer := strings.TrimSpace(question.AnswerOutline)
			if questionTitle == "" || len(questionTitle) > publishPodQuestionTextMaxLength {
				return nil, invalidPublishPod("question must be between 1 and 256 characters")
			}
			if answer == "" || len(answer) > publishPodQuestionTextMaxLength {
				return nil, invalidPublishPod("answer must be between 1 and 256 characters")
			}
			hint := trimOptionalString(question.Hint)
			if hint != nil && len(*hint) > publishPodQuestionTextMaxLength {
				return nil, invalidPublishPod("hint must be at most 256 characters")
			}
			questions = append(questions, normalizedPublishPodQuestion{
				ID:            questionID,
				Title:         questionTitle,
				AnswerOutline: answer,
				Description:   trimOptionalString(question.Description),
				Hint:          hint,
			})
		}

		normalized = append(normalized, normalizedPublishPodTask{
			ID:        taskID,
			Title:     title,
			Content:   content,
			Questions: questions,
		})
	}

	return normalized, nil
}

const (
	publishPodQuestionTextMaxLength = 256
	publishPodTaskContentMaxLength  = 4096
	publishPodSortOrderOffset       = 10000
)

func validatePublishedPodPermissions(permissions publishPodPermissionRequest) error {
	if permissions.AllowMask < 0 || permissions.DenyMask < 0 {
		return fmt.Errorf("permission masks must be non-negative")
	}
	if permissions.AllowMask&permissions.DenyMask != 0 {
		return fmt.Errorf("permission masks cannot overlap")
	}
	if permissions.AllowMask|permissions.DenyMask > int64(authorization.FullAccessMask) {
		return fmt.Errorf("permission mask includes unsupported bits")
	}

	return nil
}

func parsePublishedPodStatus(status string) (database.PublishedPodStatus, error) {
	switch database.PublishedPodStatus(strings.TrimSpace(status)) {
	case database.PublishedPodStatusListed:
		return database.PublishedPodStatusListed, nil
	case database.PublishedPodStatusUnlisted:
		return database.PublishedPodStatusUnlisted, nil
	default:
		return "", fmt.Errorf("status must be listed or unlisted")
	}
}

func publishedPodQuestionAnswerStateChanged(
	existing database.ListPublishedPodQuestionsByTaskIDsRow,
	next normalizedPublishPodQuestion,
) bool {
	return existing.Title != next.Title || !answersMatch(existing.AnswerOutline, next.AnswerOutline)
}
