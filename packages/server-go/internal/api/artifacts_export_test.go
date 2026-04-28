package api

import "net/http"

// Test-only exports for cv_1_2_artifacts_test.go (external api_test package).
// The handler methods are private intentionally; these wrappers keep the
// production surface minimal while letting unit tests drive each method
// directly with a synthetic *http.Request.

func (h *ArtifactHandler) HandleCreate(w http.ResponseWriter, r *http.Request) {
	h.handleCreate(w, r)
}

func (h *ArtifactHandler) HandleCommit(w http.ResponseWriter, r *http.Request) {
	h.handleCommit(w, r)
}

func (h *ArtifactHandler) HandleRollback(w http.ResponseWriter, r *http.Request) {
	h.handleRollback(w, r)
}
