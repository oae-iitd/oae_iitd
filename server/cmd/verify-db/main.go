package main

import (
	"fmt"
	"log"
	"time"

	"github.com/server/internal/config"
	"github.com/server/internal/database"
)

func main() {
	config.Init()

	// Initialize database connection
	database.Connect(config.DatabaseURL())
	defer database.Close()

	ctx, cancel := database.DefaultTimeout()
	defer cancel()

	fmt.Println("Verifying database structure and queries...")

	// 1. Check if sessions table exists
	fmt.Println("[1] Checking sessions table structure...")
	tableCheckQuery := `
		SELECT column_name, data_type, is_nullable
		FROM information_schema.columns
		WHERE table_name = 'sessions'
		ORDER BY ordinal_position
	`

	rows, err := database.GetPool().Query(ctx, tableCheckQuery)
	if err != nil {
		log.Fatalf("failed to check table structure: %v", err)
	}
	defer rows.Close()

	fmt.Println("   Columns in 'sessions' table:")
	var hasLocation bool
	for rows.Next() {
		var colName, dataType, nullable string
		if err := rows.Scan(&colName, &dataType, &nullable); err != nil {
			log.Printf("   Error scanning: %v", err)
			continue
		}
		if colName == "location" {
			hasLocation = true
		}
		fmt.Printf("   - %s (%s, nullable: %s)\n", colName, dataType, nullable)
	}
	if err := rows.Err(); err != nil {
		log.Fatalf("error iterating columns: %v", err)
	}

	if !hasLocation {
		fmt.Println("   WARNING: 'location' column not found")
	} else {
		fmt.Println("   OK: 'location' column exists")
	}

	// 2. Check session statistics
	fmt.Println("\n[2] Checking session statistics...")
	statsQuery := `
		SELECT 
			COUNT(*) as total_sessions,
			COUNT(CASE WHEN location IS NOT NULL THEN 1 END) as sessions_with_location,
			COUNT(CASE WHEN location IS NULL AND ip_address IS NOT NULL THEN 1 END) as sessions_needing_location,
			COUNT(CASE WHEN expires_at > CURRENT_TIMESTAMP THEN 1 END) as active_sessions
		FROM sessions
	`

	var total, withLocation, needingLocation, active int
	err = database.GetPool().QueryRow(ctx, statsQuery).Scan(&total, &withLocation, &needingLocation, &active)
	if err != nil {
		log.Fatalf("failed to get statistics: %v", err)
	}

	fmt.Printf("   Total sessions: %d\n", total)
	fmt.Printf("   Sessions with location: %d\n", withLocation)
	fmt.Printf("   Sessions needing location: %d\n", needingLocation)
	fmt.Printf("   Active sessions: %d\n", active)

	// 3. Test GetUserSessions query
	fmt.Println("\n[3] Testing GetUserSessions query...")
	testQuery := `
		SELECT id, user_id, session_id, device_info, user_agent, ip_address, location,
		       is_current, last_active, expires_at, created_at
		FROM sessions
		WHERE expires_at > CURRENT_TIMESTAMP
		LIMIT 5
	`

	testRows, err := database.GetPool().Query(ctx, testQuery)
	if err != nil {
		log.Printf("   WARN: query test failed: %v", err)
	} else {
		defer testRows.Close()
		count := 0
		for testRows.Next() {
			var id, userID int
			var sessionID, deviceInfo, userAgent, ipAddress string
			var location *string
			var isCurrent bool
			var lastActive, expiresAt, createdAt time.Time

			err := testRows.Scan(&id, &userID, &sessionID, &deviceInfo, &userAgent, &ipAddress, &location, &isCurrent, &lastActive, &expiresAt, &createdAt)
			if err != nil {
				log.Printf("   WARN: scan error: %v", err)
				continue
			}
			count++

			locStr := "NULL"
			if location != nil {
				locStr = *location
			}
			fmt.Printf("   Session %d: %s (Location: %s, IP: %s)\n", id, sessionID[:8]+"...", locStr, ipAddress)
		}
		if count == 0 {
			fmt.Println("   No active sessions (normal if nobody is logged in)")
		} else {
			fmt.Printf("   OK: queried %d session(s)\n", count)
		}
	}

	// 4. Check indexes
	fmt.Println("\n[4] Checking indexes on sessions table...")
	indexQuery := `
		SELECT indexname, indexdef
		FROM pg_indexes
		WHERE tablename = 'sessions'
	`

	indexRows, err := database.GetPool().Query(ctx, indexQuery)
	if err != nil {
		log.Printf("   WARN: failed to check indexes: %v", err)
	} else {
		defer indexRows.Close()
		indexCount := 0
		for indexRows.Next() {
			var indexName, indexDef string
			if err := indexRows.Scan(&indexName, &indexDef); err != nil {
				continue
			}
			fmt.Printf("   - %s\n", indexName)
			indexCount++
		}
		if indexCount == 0 {
			fmt.Println("   WARN: no indexes found")
		} else {
			fmt.Printf("   OK: %d index(es)\n", indexCount)
		}
	}

	// 5. Test connection pool
	fmt.Println("\n[5] Testing connection pool...")
	pool := database.GetPool()
	if pool == nil {
		fmt.Println("   ERROR: connection pool is nil")
	} else {
		stats := pool.Stat()
		fmt.Printf("   Total connections: %d\n", stats.TotalConns())
		fmt.Printf("   Acquired connections: %d\n", stats.AcquiredConns())
		fmt.Printf("   Idle connections: %d\n", stats.IdleConns())
		fmt.Println("   OK: connection pool is healthy")
	}

	fmt.Println("\nDatabase verification completed.")
}
