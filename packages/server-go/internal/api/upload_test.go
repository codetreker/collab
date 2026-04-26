package api_test

import (
	"bytes"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"mime/multipart"
	"net/http"
	"strings"
	"testing"

	"borgee-server/internal/testutil"
)

func createUploadRequest(t *testing.T, serverURL, token, fieldName, filename, contentType string, content []byte) *http.Request {
	t.Helper()
	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)

	h := make(map[string][]string)
	h["Content-Disposition"] = []string{`form-data; name="` + fieldName + `"; filename="` + filename + `"`}
	h["Content-Type"] = []string{contentType}
	part, err := w.CreatePart(h)
	if err != nil {
		t.Fatal(err)
	}
	part.Write(content)
	w.Close()

	req, _ := http.NewRequest("POST", serverURL+"/api/v1/upload", &buf)
	req.Header.Set("Content-Type", w.FormDataContentType())
	if token != "" {
		req.AddCookie(&http.Cookie{Name: "borgee_token", Value: token})
	}
	return req
}

func makeJPEG(t *testing.T) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, 1, 1))
	img.Set(0, 0, color.RGBA{255, 0, 0, 255})
	var buf bytes.Buffer
	jpeg.Encode(&buf, img, nil)
	return buf.Bytes()
}

func makePNG(t *testing.T) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, 1, 1))
	img.Set(0, 0, color.RGBA{0, 255, 0, 255})
	var buf bytes.Buffer
	png.Encode(&buf, img)
	return buf.Bytes()
}

func TestUpload(t *testing.T) {
	ts, _, _ := testutil.NewTestServer(t)
	token := testutil.LoginAs(t, ts.URL, "owner@test.com", "password123")

	client := &http.Client{}

	t.Run("UploadJPEG", func(t *testing.T) {
		req := createUploadRequest(t, ts.URL, token, "file", "test.jpg", "image/jpeg", makeJPEG(t))
		resp, err := client.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusCreated {
			t.Fatalf("expected 201, got %d", resp.StatusCode)
		}
	})

	t.Run("UploadPNG", func(t *testing.T) {
		req := createUploadRequest(t, ts.URL, token, "file", "test.png", "image/png", makePNG(t))
		resp, err := client.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusCreated {
			t.Fatalf("expected 201, got %d", resp.StatusCode)
		}
	})

	t.Run("RejectNonImage", func(t *testing.T) {
		req := createUploadRequest(t, ts.URL, token, "file", "test.txt", "text/plain", []byte("hello"))
		resp, err := client.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d", resp.StatusCode)
		}
	})

	t.Run("RejectTooLarge", func(t *testing.T) {
		bigData := make([]byte, 11*1024*1024) // 11MB
		req := createUploadRequest(t, ts.URL, token, "file", "big.jpg", "image/jpeg", bigData)
		resp, err := client.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusRequestEntityTooLarge && resp.StatusCode != http.StatusBadRequest {
			t.Fatalf("expected 413 or 400, got %d", resp.StatusCode)
		}
	})

	t.Run("NoFile", func(t *testing.T) {
		req, _ := http.NewRequest("POST", ts.URL+"/api/v1/upload", strings.NewReader(""))
		req.Header.Set("Content-Type", "multipart/form-data; boundary=xxx")
		req.AddCookie(&http.Cookie{Name: "borgee_token", Value: token})
		resp, err := client.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d", resp.StatusCode)
		}
	})

	t.Run("Unauthenticated", func(t *testing.T) {
		req := createUploadRequest(t, ts.URL, "", "file", "test.jpg", "image/jpeg", makeJPEG(t))
		resp, err := client.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusUnauthorized {
			t.Fatalf("expected 401, got %d", resp.StatusCode)
		}
	})
}
