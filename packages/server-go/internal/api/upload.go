package api

import (
	"io"
	"log/slog"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"collab-server/internal/auth"
	"collab-server/internal/config"

	"github.com/google/uuid"
)

type UploadHandler struct {
	Config *config.Config
	Logger *slog.Logger
}

func (h *UploadHandler) RegisterRoutes(mux *http.ServeMux, authMw func(http.Handler) http.Handler) {
	mux.Handle("POST /api/v1/upload", authMw(http.HandlerFunc(h.handleUpload)))
}

var allowedImageTypes = map[string]bool{
	"image/jpeg": true,
	"image/png":  true,
	"image/gif":  true,
	"image/webp": true,
}

var mimeToExt = map[string]string{
	"image/jpeg": ".jpg",
	"image/png":  ".png",
	"image/gif":  ".gif",
	"image/webp": ".webp",
}

func (h *UploadHandler) handleUpload(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFromContext(r.Context())
	if user == nil {
		writeJSONError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	const maxSize = 10 << 20 // 10MB
	r.Body = http.MaxBytesReader(w, r.Body, maxSize)

	if err := r.ParseMultipartForm(maxSize); err != nil {
		writeJSONError(w, http.StatusBadRequest, "File too large (max 10MB)")
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "No file provided")
		return
	}
	defer file.Close()

	contentType := header.Header.Get("Content-Type")
	if contentType == "" {
		contentType = mime.TypeByExtension(filepath.Ext(header.Filename))
	}
	contentType = strings.Split(contentType, ";")[0]

	if !allowedImageTypes[contentType] {
		writeJSONError(w, http.StatusBadRequest, "Only image files (jpeg, png, gif, webp) are allowed")
		return
	}

	ext := mimeToExt[contentType]
	filename := uuid.NewString() + ext

	if err := os.MkdirAll(h.Config.UploadDir, 0o755); err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Failed to create upload directory")
		return
	}

	dst, err := os.Create(filepath.Join(h.Config.UploadDir, filename))
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Failed to save file")
		return
	}
	defer dst.Close()

	if _, err := io.Copy(dst, file); err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Failed to save file")
		return
	}

	writeJSONResponse(w, http.StatusCreated, map[string]any{
		"url":          "/uploads/" + filename,
		"content_type": contentType,
	})
}
