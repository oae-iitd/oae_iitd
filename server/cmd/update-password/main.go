package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"time"

	"golang.org/x/crypto/bcrypt"

	"github.com/server/internal/config"
	"github.com/server/internal/database"
)

func main() {
	if len(os.Args) < 3 {
		log.Fatal("Usage: go run main.go <username> <new_password>")
	}

	username := os.Args[1]
	newPassword := os.Args[2]

	// Initialize config
	config.Init()

	// Connect to database
	database.Connect(config.DatabaseURL())
	defer database.Close()

	// Hash the new password
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		log.Fatalf("Failed to hash password: %v", err)
	}

	// Update password in database
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	result, err := database.GetPool().Exec(ctx,
		"UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE username = $2",
		string(hashedPassword),
		username,
	)

	if err != nil {
		log.Fatalf("Failed to update password: %v", err)
	}

	if result.RowsAffected() == 0 {
		log.Fatalf("User '%s' not found", username)
	}

	fmt.Printf("Password updated for user: %s\n", username)
}
