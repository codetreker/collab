package auth

import (
	"os"
	"strconv"

	"golang.org/x/crypto/bcrypt"
)

// BcryptCost is the cost factor passed to bcrypt.GenerateFromPassword. Default
// is 10 (golang.org/x/crypto/bcrypt.DefaultCost) — strong enough for production.
//
// TEST-FIX-3-COV: lowered to bcrypt.MinCost (4) when env var BORGEE_TEST_FAST_BCRYPT=1
// is set so test runs avoid the ~65ms-per-call cost-10 wall on every register/admin-create
// path. Production never sets this env var (verified by reverse-grep on `BORGEE_TEST_FAST_BCRYPT`
// in production cmd/* and config/*). 跟 testutil/server.go::init 同源 — when tests
// import any borgee internal package, init() reads env once and pins BcryptCost.
var BcryptCost = func() int {
	if v := os.Getenv("BORGEE_TEST_FAST_BCRYPT"); v != "" {
		// Permissive parse: any non-empty truthy value flips to MinCost.
		if v == "1" || v == "true" || v == "TRUE" {
			return bcrypt.MinCost
		}
		// Numeric: caller may set custom cost (e.g. "4" for MinCost, "6" for medium).
		if n, err := strconv.Atoi(v); err == nil && n >= bcrypt.MinCost && n <= bcrypt.MaxCost {
			return n
		}
	}
	return 10
}()

func HashPassword(password string) (string, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), BcryptCost)
	if err != nil {
		return "", err
	}
	return string(hash), nil
}

func CheckPassword(password, hash string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil
}
