package main

import (
	"bufio"
	"context"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/server/internal/auth"
	"github.com/server/internal/config"
	"github.com/server/internal/database"
)

const migrationsDir = "internal/database/migrations"

func main() {
	config.Init()

	database.Connect(config.DatabaseURL())
	defer database.Close()

	direction := "up"
	if len(os.Args) > 1 {
		direction = strings.ToLower(os.Args[1])
	}

	switch direction {
	case "up":
		runUp()
		seedSuperAdmin()
	case "down":
		steps := 1
		if len(os.Args) > 2 {
			fmt.Sscanf(os.Args[2], "%d", &steps)
		}
		runDown(steps)
	default:
		log.Fatalf("Unknown direction %q. Use 'up' or 'down [N]'.", direction)
	}
}

// runUp applies all *.up.sql migrations in ascending order.
func runUp() {
	files := collectFiles(".up.sql", true)
	if len(files) == 0 {
		fmt.Println("No up migrations found.")
		return
	}
	for _, name := range files {
		runFile(name)
	}
	fmt.Println("All up migrations completed.")
}

// runDown rolls back the last N *.down.sql migrations in descending order.
func runDown(steps int) {
	files := collectFiles(".down.sql", false) // descending
	if len(files) == 0 {
		fmt.Println("No down migrations found.")
		return
	}
	if steps > len(files) {
		steps = len(files)
	}
	for _, name := range files[:steps] {
		runFile(name)
	}
	fmt.Printf("Rolled back %d migration(s).\n", steps)
}

// collectFiles returns migration file names matching suffix, sorted asc or desc.
func collectFiles(suffix string, ascending bool) []string {
	entries, err := os.ReadDir(migrationsDir)
	if err != nil {
		log.Fatal("Failed to read migrations directory:", err)
	}

	var names []string
	for _, e := range entries {
		n := e.Name()
		if strings.HasSuffix(n, suffix) && !strings.HasPrefix(n, ".") {
			names = append(names, n)
		}
	}

	sort.Strings(names)
	if !ascending {
		for i, j := 0, len(names)-1; i < j; i, j = i+1, j-1 {
			names[i], names[j] = names[j], names[i]
		}
	}
	return names
}

// runFile reads and executes a single SQL migration file.
func runFile(filename string) {
	fmt.Printf("Running migration: %s\n", filename)

	path := filepath.Join(migrationsDir, filename)
	f, err := os.Open(path)
	if err != nil {
		log.Fatalf("Failed to open migration file %s: %v", filename, err)
	}
	defer f.Close()

	var sql strings.Builder
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line != "" && !strings.HasPrefix(line, "--") {
			sql.WriteString(line)
			sql.WriteString("\n")
		}
	}
	if err := scanner.Err(); err != nil {
		log.Fatalf("Error reading migration file %s: %v", filename, err)
	}

	ctx, cancel := database.DefaultTimeout()
	_, err = database.GetPool().Exec(ctx, sql.String())
	cancel()
	if err != nil {
		log.Fatalf("Failed to execute migration %s: %v", filename, err)
	}

	fmt.Printf("Migration %s completed\n", filename)
}

// seedSuperAdmin creates the initial SuperAdmin user from environment variables.
func seedSuperAdmin() {
	adminUsername := os.Getenv("ADMIN_USERNAME")
	adminEmail := os.Getenv("ADMIN_EMAIL")
	adminPassword := os.Getenv("ADMIN_PASSWORD")

	if adminUsername == "" || adminEmail == "" || adminPassword == "" {
		fmt.Println("Skipping SuperAdmin seed: ADMIN_USERNAME, ADMIN_EMAIL, or ADMIN_PASSWORD not set")
		return
	}

	ctx := context.Background()

	var exists bool
	err := database.GetPool().QueryRow(ctx,
		"SELECT EXISTS(SELECT 1 FROM users WHERE username = $1 OR email = $2)",
		adminUsername, adminEmail).Scan(&exists)
	if err != nil {
		log.Printf("Warning: Failed to check existing user: %v", err)
		return
	}

	if exists {
		fmt.Printf("SuperAdmin user '%s' already exists, skipping seed\n", adminUsername)
		return
	}

	passwordHash, err := auth.HashPassword(adminPassword)
	if err != nil {
		log.Printf("Warning: Failed to hash password: %v", err)
		return
	}

	_, err = database.GetPool().Exec(ctx,
		"INSERT INTO users (username, email, password_hash, role) VALUES ($1, $2, $3, 'SuperAdmin')",
		adminUsername, adminEmail, passwordHash)
	if err != nil {
		log.Printf("Warning: Failed to create SuperAdmin user: %v", err)
		return
	}

	fmt.Printf("SuperAdmin user '%s' created\n", adminUsername)
}
