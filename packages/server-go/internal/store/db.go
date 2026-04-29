package store

import (
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

type Store struct {
	db *gorm.DB
}

func Open(dsn string) (*Store, error) {
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Warn),
	})
	if err != nil {
		return nil, err
	}

	sqlDB, err := db.DB()
	if err != nil {
		return nil, err
	}
	if dsn == ":memory:" {
		sqlDB.SetMaxOpenConns(1)
	}

	// PERF: WAL only meaningful on file-backed sqlite. :memory: WAL is no-op
	// at best, contention source at worst (per-test isolated in-mem DB pays
	// pragma cost N times for nothing). Skip for :memory:; file dsn keeps WAL.
	pragmas := []string{
		"PRAGMA foreign_keys=ON",
		"PRAGMA busy_timeout=5000",
	}
	if dsn != ":memory:" {
		pragmas = append([]string{"PRAGMA journal_mode=WAL"}, pragmas...)
	}
	for _, pragma := range pragmas {
		if _, err := sqlDB.Exec(pragma); err != nil {
			return nil, err
		}
	}

	return &Store{db: db}, nil
}

func (s *Store) DB() *gorm.DB {
	return s.db
}

func (s *Store) Close() error {
	sqlDB, err := s.db.DB()
	if err != nil {
		return err
	}
	return sqlDB.Close()
}
