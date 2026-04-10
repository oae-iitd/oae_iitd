package database

import (
	"testing"
)

func TestGetPoolBeforeConnect(t *testing.T) {
	_ = GetPool()
}

func TestGetPoolReturnsPackageLevelPool(t *testing.T) {
	if GetPool() != pool {
		t.Error("GetPool() should return the package-level pool")
	}
}
