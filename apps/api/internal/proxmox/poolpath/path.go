package poolpath

import "strings"

func Encode(path []string) string { return strings.Join(path, "/") }

func Decode(poolID string) []string { return strings.Split(poolID, "/") }
