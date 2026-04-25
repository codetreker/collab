package model

import "collab-server/internal/store"

type contextKey string

const UserContextKey contextKey = "user"

type User = store.User
