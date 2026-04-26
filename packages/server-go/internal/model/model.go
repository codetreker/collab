package model

import "borgee-server/internal/store"

type contextKey string

const UserContextKey contextKey = "user"

type User = store.User
