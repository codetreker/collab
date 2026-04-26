package api

import (
	"errors"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"borgee-server/internal/auth"
	"borgee-server/internal/config"
	"borgee-server/internal/store"

	"github.com/google/uuid"
)

type WorkspaceHandler struct {
	Store  *store.Store
	Config *config.Config
	Logger *slog.Logger
}

func (h *WorkspaceHandler) RegisterRoutes(mux *http.ServeMux, authMw func(http.Handler) http.Handler) {
	wrap := func(f http.HandlerFunc) http.Handler { return authMw(f) }

	mux.Handle("GET /api/v1/channels/{channelId}/workspace", wrap(h.handleListFiles))
	mux.Handle("POST /api/v1/channels/{channelId}/workspace/upload", wrap(h.handleUploadFile))
	mux.Handle("GET /api/v1/channels/{channelId}/workspace/files/{id}", wrap(h.handleDownloadFile))
	mux.Handle("PUT /api/v1/channels/{channelId}/workspace/files/{id}", wrap(h.handleUpdateFile))
	mux.Handle("PATCH /api/v1/channels/{channelId}/workspace/files/{id}", wrap(h.handleRenameFile))
	mux.Handle("DELETE /api/v1/channels/{channelId}/workspace/files/{id}", wrap(h.handleDeleteFile))
	mux.Handle("POST /api/v1/channels/{channelId}/workspace/mkdir", wrap(h.handleMkdir))
	mux.Handle("POST /api/v1/channels/{channelId}/workspace/files/{id}/move", wrap(h.handleMoveFile))
	mux.Handle("GET /api/v1/workspaces", wrap(h.handleListAllWorkspaces))
}

func (h *WorkspaceHandler) handleListFiles(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFromContext(r.Context())
	if user == nil {
		writeJSONError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	channelID := r.PathValue("channelId")
	if !h.Store.IsChannelMember(channelID, user.ID) && user.Role != "admin" {
		writeJSONError(w, http.StatusForbidden, "Not a member of this channel")
		return
	}

	var parentID *string
	if pid := r.URL.Query().Get("parentId"); pid != "" {
		parentID = &pid
	}

	files, err := h.Store.ListWorkspaceFiles(user.ID, channelID, parentID)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Failed to list files")
		return
	}
	if files == nil {
		files = []store.WorkspaceFile{}
	}
	writeJSONResponse(w, http.StatusOK, map[string]any{"files": files})
}

func (h *WorkspaceHandler) handleUploadFile(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFromContext(r.Context())
	if user == nil {
		writeJSONError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	channelID := r.PathValue("channelId")
	if !h.Store.IsChannelMember(channelID, user.ID) && user.Role != "admin" {
		writeJSONError(w, http.StatusForbidden, "Not a member of this channel")
		return
	}

	const maxSize = 10 << 20
	r.Body = http.MaxBytesReader(w, r.Body, maxSize)
	if err := r.ParseMultipartForm(maxSize); err != nil {
		var maxBytesErr *http.MaxBytesError
		if errors.As(err, &maxBytesErr) {
			writeJSONError(w, http.StatusRequestEntityTooLarge, "File too large (max 10MB)")
			return
		}
		writeJSONError(w, http.StatusBadRequest, "File too large (max 10MB)")
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "No file provided")
		return
	}
	defer file.Close()

	var parentID *string
	if pid := r.URL.Query().Get("parentId"); pid != "" {
		parentID = &pid
	}

	siblings, _ := h.Store.GetSiblingNames(user.ID, channelID, parentID)
	filename := store.ResolveConflict(header.Filename, siblings)

	fileID := uuid.NewString()
	dirPath := filepath.Join(h.Config.WorkspaceDir, user.ID, channelID)
	if err := os.MkdirAll(dirPath, 0o755); err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Failed to create directory")
		return
	}

	dst, err := os.Create(filepath.Join(dirPath, fileID+".dat"))
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Failed to save file")
		return
	}
	defer dst.Close()

	written, err := io.Copy(dst, file)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Failed to save file")
		return
	}

	contentType := header.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	contentType = strings.Split(contentType, ";")[0]

	wf := &store.WorkspaceFile{
		ID:        fileID,
		UserID:    user.ID,
		ChannelID: channelID,
		ParentID:  parentID,
		Name:      filename,
		MimeType:  contentType,
		SizeBytes: written,
		Source:    "upload",
	}

	result, err := h.Store.InsertWorkspaceFile(wf)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Failed to create file record")
		return
	}

	writeJSONResponse(w, http.StatusCreated, map[string]any{"file": result})
}

func (h *WorkspaceHandler) loadWorkspaceFileForRequest(r *http.Request, fileID, channelID string) (*store.WorkspaceFile, int, string) {
	user := auth.UserFromContext(r.Context())
	if user == nil {
		return nil, http.StatusUnauthorized, "Unauthorized"
	}

	f, err := h.Store.GetWorkspaceFile(fileID)
	if err != nil {
		return nil, http.StatusNotFound, "File not found"
	}

	if f.ChannelID != channelID {
		return nil, http.StatusNotFound, "File not found"
	}

	if f.UserID != user.ID && user.Role != "admin" {
		return nil, http.StatusForbidden, "Forbidden"
	}

	return f, 0, ""
}

func (h *WorkspaceHandler) handleDownloadFile(w http.ResponseWriter, r *http.Request) {
	channelID := r.PathValue("channelId")
	id := r.PathValue("id")

	f, status, errMsg := h.loadWorkspaceFileForRequest(r, id, channelID)
	if f == nil {
		writeJSONError(w, status, errMsg)
		return
	}

	filePath := filepath.Join(h.Config.WorkspaceDir, f.UserID, f.ChannelID, f.ID+".dat")
	data, err := os.Open(filePath)
	if err != nil {
		writeJSONError(w, http.StatusNotFound, "File not found on disk")
		return
	}
	defer data.Close()

	ct := f.MimeType
	if ct == "" {
		ct = "application/octet-stream"
	}
	w.Header().Set("Content-Type", ct)
	w.Header().Set("Content-Disposition", "inline; filename=\""+f.Name+"\"")
	io.Copy(w, data)
}

func (h *WorkspaceHandler) handleUpdateFile(w http.ResponseWriter, r *http.Request) {
	channelID := r.PathValue("channelId")
	id := r.PathValue("id")

	f, status, errMsg := h.loadWorkspaceFileForRequest(r, id, channelID)
	if f == nil {
		writeJSONError(w, status, errMsg)
		return
	}

	var body struct {
		Content string `json:"content"`
	}
	if err := readJSON(r, &body); err != nil {
		writeJSONError(w, http.StatusBadRequest, err.Error())
		return
	}

	filePath := filepath.Join(h.Config.WorkspaceDir, f.UserID, f.ChannelID, f.ID+".dat")
	if err := os.WriteFile(filePath, []byte(body.Content), 0o644); err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Failed to update file")
		return
	}

	h.Store.UpdateWorkspaceFileSize(id, int64(len(body.Content)))

	updated, _ := h.Store.GetWorkspaceFile(id)
	writeJSONResponse(w, http.StatusOK, map[string]any{"file": updated})
}

func (h *WorkspaceHandler) handleRenameFile(w http.ResponseWriter, r *http.Request) {
	channelID := r.PathValue("channelId")
	id := r.PathValue("id")

	f, status, errMsg := h.loadWorkspaceFileForRequest(r, id, channelID)
	if f == nil {
		writeJSONError(w, status, errMsg)
		return
	}

	var body struct {
		Name string `json:"name"`
	}
	if err := readJSON(r, &body); err != nil {
		writeJSONError(w, http.StatusBadRequest, err.Error())
		return
	}
	if body.Name == "" {
		writeJSONError(w, http.StatusBadRequest, "name is required")
		return
	}

	result, err := h.Store.RenameWorkspaceFile(id, body.Name)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Failed to rename file")
		return
	}

	writeJSONResponse(w, http.StatusOK, map[string]any{"file": result})
}

func (h *WorkspaceHandler) handleDeleteFile(w http.ResponseWriter, r *http.Request) {
	channelID := r.PathValue("channelId")
	id := r.PathValue("id")

	f, status, errMsg := h.loadWorkspaceFileForRequest(r, id, channelID)
	if f == nil {
		writeJSONError(w, status, errMsg)
		return
	}

	if !f.IsDirectory {
		filePath := filepath.Join(h.Config.WorkspaceDir, f.UserID, f.ChannelID, f.ID+".dat")
		os.Remove(filePath)
	}

	if err := h.Store.DeleteWorkspaceFile(id); err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Failed to delete file")
		return
	}

	writeJSONResponse(w, http.StatusOK, map[string]any{"ok": true})
}

func (h *WorkspaceHandler) handleMkdir(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFromContext(r.Context())
	if user == nil {
		writeJSONError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	channelID := r.PathValue("channelId")

	var body struct {
		Name     string  `json:"name"`
		ParentID *string `json:"parentId"`
	}
	if err := readJSON(r, &body); err != nil {
		writeJSONError(w, http.StatusBadRequest, err.Error())
		return
	}
	if body.Name == "" {
		writeJSONError(w, http.StatusBadRequest, "name is required")
		return
	}

	dir, err := h.Store.MkdirWorkspace(user.ID, channelID, body.ParentID, body.Name)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Failed to create directory")
		return
	}

	writeJSONResponse(w, http.StatusCreated, map[string]any{"file": dir})
}

func (h *WorkspaceHandler) handleMoveFile(w http.ResponseWriter, r *http.Request) {
	channelID := r.PathValue("channelId")
	id := r.PathValue("id")

	f, status, errMsg := h.loadWorkspaceFileForRequest(r, id, channelID)
	if f == nil {
		writeJSONError(w, status, errMsg)
		return
	}

	var body struct {
		ParentID *string `json:"parentId"`
	}
	if err := readJSON(r, &body); err != nil {
		writeJSONError(w, http.StatusBadRequest, err.Error())
		return
	}

	result, err := h.Store.MoveWorkspaceFile(id, body.ParentID)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Failed to move file")
		return
	}

	writeJSONResponse(w, http.StatusOK, map[string]any{"file": result})
}

func (h *WorkspaceHandler) handleListAllWorkspaces(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFromContext(r.Context())
	if user == nil {
		writeJSONError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	files, err := h.Store.GetAllWorkspaceFiles(user.ID)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Failed to list files")
		return
	}
	if files == nil {
		files = []store.WorkspaceFile{}
	}
	writeJSONResponse(w, http.StatusOK, map[string]any{"files": files})
}
