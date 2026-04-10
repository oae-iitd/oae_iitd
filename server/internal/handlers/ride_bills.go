package handlers

import (
	"context"
	"fmt"
	"log"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"

	"github.com/server/internal/database"
)

// rideBillRow represents a ride bill with joined data from database
type rideBillRow struct {
	ID               int
	RideID           *int // nullable after route deletion (migration 019)
	UserID           int
	FromLoc          string
	ToLoc            string
	Fare             float64
	Status           string
	Driver           *string
	Reason           *string
	RideNumber       *string
	CreatedAt        time.Time
	UpdatedAt        time.Time
	RLID             *int
	RLFrom           *string
	RLTo             *string
	RLFare           *float64
	UID              *int
	Username         *string
	Email            *string
	Name             *string
	EnrollmentNumber *string
	DriverID         *int
	DriverName       *string
}

// toMap converts rideBillRow to fiber.Map for JSON response
func (r *rideBillRow) toMap() fiber.Map {
	billMap := fiber.Map{
		"_id":          strconv.Itoa(r.ID),
		"fromLocation": r.FromLoc,
		"toLocation":   r.ToLoc,
		"fare":         r.Fare,
		"status":       r.Status,
		"createdAt":    r.CreatedAt.Format(time.RFC3339),
		"updatedAt":    r.UpdatedAt.Format(time.RFC3339),
	}

	if r.Reason != nil {
		billMap["reason"] = *r.Reason
	}

	if r.RideNumber != nil {
		billMap["rideNumber"] = *r.RideNumber
	}

	// Add ride information
	if r.RLID != nil {
		billMap["rideId"] = fiber.Map{
			"_id":          strconv.Itoa(*r.RLID),
			"fromLocation": *r.RLFrom,
			"toLocation":   *r.RLTo,
			"fare":         *r.RLFare,
		}
	} else if r.RideID != nil {
		billMap["rideId"] = strconv.Itoa(*r.RideID)
	} else {
		billMap["rideId"] = nil
	}

	// Add user information
	if r.UID != nil {
		userMap := fiber.Map{"_id": strconv.Itoa(*r.UID)}
		if r.Username != nil {
			userMap["username"] = *r.Username
		}
		if r.Email != nil {
			userMap["email"] = *r.Email
		}
		if r.Name != nil {
			userMap["name"] = *r.Name
		}
		if r.EnrollmentNumber != nil {
			userMap["enrollmentNumber"] = *r.EnrollmentNumber
		}
		billMap["userId"] = userMap
	} else {
		billMap["userId"] = strconv.Itoa(r.UserID)
	}

	if r.DriverID != nil {
		driverMap := fiber.Map{"_id": strconv.Itoa(*r.DriverID)}
		if r.DriverName != nil {
			driverMap["name"] = *r.DriverName
		}
		billMap["driver"] = driverMap
	} else if r.Driver != nil {
		billMap["driver"] = *r.Driver
	}

	return billMap
}

// scanRideBill scans a database row into rideBillRow struct
func scanRideBill(row pgx.Row) (*rideBillRow, error) {
	r := &rideBillRow{}
	err := row.Scan(
		&r.ID, &r.RideID, &r.UserID, &r.FromLoc, &r.ToLoc, &r.Fare, &r.Status,
		&r.Driver, &r.Reason, &r.RideNumber, &r.CreatedAt, &r.UpdatedAt,
		&r.RLID, &r.RLFrom, &r.RLTo, &r.RLFare,
		&r.UID, &r.Username, &r.Email, &r.Name, &r.EnrollmentNumber,
		&r.DriverID, &r.DriverName,
	)
	return r, err
}

// checkTableExists verifies if a table exists in the database
func checkTableExists(ctx context.Context, tableName string) error {
	var exists bool
	query := `SELECT EXISTS (
		SELECT FROM information_schema.tables 
		WHERE table_schema = 'public' AND table_name = $1
	)`
	if err := database.GetPool().QueryRow(ctx, query, tableName).Scan(&exists); err != nil {
		return err
	}
	if !exists {
		return fiber.NewError(500, tableName+" table does not exist. Please run the database migration.")
	}
	return nil
}

// buildRideBillQuery constructs the base query for ride bills with joins
func buildRideBillQuery() string {
	return `
		SELECT
			rb.id, rb.ride_id, rb.user_id, rb.from_location, rb.to_location,
			rb.fare, rb.status, rb.driver, rb.reason, rb.ride_number, rb.created_at, rb.updated_at,
			rl.id as rl_id, rl.from_location as rl_from, rl.to_location as rl_to, rl.fare as rl_fare,
			u.id as u_id, u.username, u.email, u.name, u.enrollment_number,
			d.id as d_id, d.name as d_name
		FROM ride_bills rb
		LEFT JOIN ride_locations rl ON rb.ride_id = rl.id
		LEFT JOIN users u ON rb.user_id = u.id
		LEFT JOIN users d ON rb.driver IS NOT NULL AND d.id::text = rb.driver
		WHERE 1=1`
}

// GetRideBills returns all ride bills with optional filters
func GetRideBills(c *fiber.Ctx) error {
	ctx, cancel := database.DefaultTimeout()
	defer cancel()

	// Check if table exists
	if err := checkTableExists(ctx, "ride_bills"); err != nil {
		log.Printf("[GetRideBills] %v", err)
		msg := err.Error()
		return c.Status(500).JSON(fiber.Map{"error": msg, "message": msg})
	}

	// Parse query parameters
	status := c.Query("status", "")
	search := c.Query("search", "")
	userID := c.Query("userId", "")

	// Build query dynamically
	query := buildRideBillQuery()
	var args []interface{}
	argIndex := 1

	if status != "" && status != "all" {
		query += " AND rb.status = $" + strconv.Itoa(argIndex)
		args = append(args, status)
		argIndex++
	}

	if userID != "" {
		uid, err := strconv.Atoi(userID)
		if err != nil {
			return c.Status(400).JSON(fiber.Map{
				"error":   "invalid userId",
				"message": "invalid userId",
			})
		}
		query += " AND rb.user_id = $" + strconv.Itoa(argIndex)
		args = append(args, uid)
		argIndex++
	}

	if search != "" {
		// Match routes, student fields, bill id, ride number, driver name/id string
		query += ` AND (
			LOWER(rb.from_location) LIKE LOWER($` + strconv.Itoa(argIndex) + `)
			OR LOWER(rb.to_location) LIKE LOWER($` + strconv.Itoa(argIndex) + `)
			OR LOWER(COALESCE(u.username, '')) LIKE LOWER($` + strconv.Itoa(argIndex) + `)
			OR LOWER(COALESCE(u.name, '')) LIKE LOWER($` + strconv.Itoa(argIndex) + `)
			OR LOWER(COALESCE(u.enrollment_number, '')) LIKE LOWER($` + strconv.Itoa(argIndex) + `)
			OR LOWER(CAST(rb.id AS TEXT)) LIKE LOWER($` + strconv.Itoa(argIndex) + `)
			OR LOWER(COALESCE(rb.ride_number, '')) LIKE LOWER($` + strconv.Itoa(argIndex) + `)
			OR LOWER(COALESCE(rb.driver, '')) LIKE LOWER($` + strconv.Itoa(argIndex) + `)
		)`
		searchPattern := "%" + search + "%"
		args = append(args, searchPattern)
	}

	query += " ORDER BY rb.created_at DESC"

	// Execute query
	rows, err := database.GetPool().Query(ctx, query, args...)
	if err != nil {
		log.Printf("[GetRideBills] Query error: %v", err)
		return c.Status(500).JSON(fiber.Map{
			"error":   "failed to fetch ride bills",
			"message": "failed to fetch ride bills",
			"details": err.Error(),
		})
	}
	defer rows.Close()

	// Scan results
	var bills []fiber.Map
	for rows.Next() {
		rideBill, err := scanRideBill(rows)
		if err != nil {
			log.Printf("[GetRideBills] Scan error: %v", err)
			continue
		}
		bills = append(bills, rideBill.toMap())
	}

	if err := rows.Err(); err != nil {
		log.Printf("[GetRideBills] Rows error: %v", err)
		return c.Status(500).JSON(fiber.Map{
			"error":   "failed to process ride bills",
			"message": "failed to process ride bills",
			"details": err.Error(),
		})
	}

	return c.JSON(bills)
}

// GetMyRideBills returns ride bills for the current authenticated user
func GetMyRideBills(c *fiber.Ctx) error {
	ctx, cancel := database.DefaultTimeout()
	defer cancel()

	// Get current user ID from session
	userID := c.Locals("userID")
	if userID == nil {
		return c.Status(401).JSON(fiber.Map{
			"error": "unauthorized",
		})
	}

	status := c.Query("status", "")

	query := `
		SELECT 
			rb.id, rb.ride_id, rb.user_id, rb.from_location, rb.to_location,
			rb.fare, rb.status, rb.driver, rb.reason, rb.created_at, rb.updated_at,
			rl.id as rl_id, rl.from_location as rl_from, rl.to_location as rl_to, rl.fare as rl_fare
		FROM ride_bills rb
		LEFT JOIN ride_locations rl ON rb.ride_id = rl.id
		WHERE rb.user_id = $1
	`
	var args []interface{}
	args = append(args, userID)
	argIndex := 2

	if status != "" && status != "all" {
		query += " AND rb.status = $" + strconv.Itoa(argIndex)
		args = append(args, status)
	}

	query += " ORDER BY rb.created_at DESC"

	rows, err := database.GetPool().Query(ctx, query, args...)
	if err != nil {
		log.Printf("[GetMyRideBills] Query error: %v", err)
		return c.Status(500).JSON(fiber.Map{
			"error": "failed to fetch ride bills",
		})
	}
	defer rows.Close()

	var bills []fiber.Map
	for rows.Next() {
		var (
			ID        int
			RideID    *int
			UserID    int
			FromLoc   string
			ToLoc     string
			Fare      float64
			Status    string
			Driver    *string
			Reason    *string
			CreatedAt time.Time
			UpdatedAt time.Time
			RLID      *int
			RLFrom    *string
			RLTo      *string
			RLFare    *float64
		)

		err := rows.Scan(
			&ID, &RideID, &UserID, &FromLoc, &ToLoc, &Fare, &Status, &Driver, &Reason,
			&CreatedAt, &UpdatedAt,
			&RLID, &RLFrom, &RLTo, &RLFare,
		)
		if err != nil {
			log.Printf("[GetMyRideBills] Scan error: %v", err)
			continue
		}

		billMap := fiber.Map{
			"_id":          strconv.Itoa(ID),
			"fromLocation": FromLoc,
			"toLocation":   ToLoc,
			"fare":         Fare,
			"status":       Status,
			"createdAt":    CreatedAt.Format(time.RFC3339),
			"updatedAt":    UpdatedAt.Format(time.RFC3339),
		}

		if Reason != nil {
			billMap["reason"] = *Reason
		}

		if RLID != nil {
			billMap["rideId"] = fiber.Map{
				"_id":          strconv.Itoa(*RLID),
				"fromLocation": *RLFrom,
				"toLocation":   *RLTo,
				"fare":         *RLFare,
			}
		} else if RideID != nil {
			billMap["rideId"] = strconv.Itoa(*RideID)
		} else {
			billMap["rideId"] = nil
		}

		if Driver != nil {
			billMap["driver"] = *Driver
		}

		bills = append(bills, billMap)
	}

	// Always return an array, even if empty
	if bills == nil {
		bills = []fiber.Map{}
	}

	return c.JSON(bills)
}

// CreateRideBill creates a new ride bill for the current user
func CreateRideBill(c *fiber.Ctx) error {
	ctx, cancel := database.DefaultTimeout()
	defer cancel()

	// Get current user ID from session
	userID := c.Locals("userID")
	if userID == nil {
		return c.Status(401).JSON(fiber.Map{
			"error": "unauthorized",
		})
	}

	var req struct {
		RideID       interface{} `json:"rideId"` // Accept string or int
		FromLocation string      `json:"fromLocation"`
		ToLocation   string      `json:"toLocation"`
		Fare         float64     `json:"fare"`
		Driver       *string     `json:"driver"`
	}

	if err := c.BodyParser(&req); err != nil {
		log.Printf("[CreateRideBill] BodyParser error: %v", err)
		return c.Status(400).JSON(fiber.Map{
			"error": "invalid request body",
		})
	}

	if req.FromLocation == "" || req.ToLocation == "" {
		return c.Status(400).JSON(fiber.Map{
			"error": "fromLocation and toLocation are required",
		})
	}

	// ========== BOOKING RESTRICTIONS ==========

	// RESTRICTION 1: Check daily ride limit (max 6 rides per day)
	var todayRideCount int
	dailyCountQuery := `
		SELECT COUNT(*) 
		FROM ride_bills 
		WHERE user_id = $1 
		AND DATE(created_at) = CURRENT_DATE
		AND status != 'cancelled'
	`
	err := database.GetPool().QueryRow(ctx, dailyCountQuery, userID).Scan(&todayRideCount)
	if err != nil {
		log.Printf("[CreateRideBill] Daily count query error: %v", err)
		return c.Status(500).JSON(fiber.Map{
			"error": "failed to check daily ride limit",
		})
	}

	if todayRideCount >= 6 {
		return c.Status(429).JSON(fiber.Map{
			"error":          "daily_limit_reached",
			"message":        "You have reached the maximum limit of 6 rides per day. Please try again tomorrow.",
			"ridesUsedToday": todayRideCount,
			"maxDailyRides":  6,
		})
	}

	// RESTRICTION 2: Check for same route booking (1 hour cooldown). Routes are bidirectional (A→B = B→A).
	var lastSameRouteTime *time.Time
	sameRouteQuery := `
		SELECT created_at 
		FROM ride_bills 
		WHERE user_id = $1 
		AND ((from_location = $2 AND to_location = $3) OR (from_location = $3 AND to_location = $2))
		AND status != 'cancelled'
		ORDER BY created_at DESC 
		LIMIT 1
	`
	err = database.GetPool().QueryRow(ctx, sameRouteQuery, userID, req.FromLocation, req.ToLocation).Scan(&lastSameRouteTime)
	if err != nil && err != pgx.ErrNoRows {
		log.Printf("[CreateRideBill] Same route query error: %v", err)
		return c.Status(500).JSON(fiber.Map{
			"error": "failed to check route booking history",
		})
	}

	if lastSameRouteTime != nil {
		timeSinceLastSameRoute := time.Since(*lastSameRouteTime)
		oneHour := time.Hour

		if timeSinceLastSameRoute < oneHour {
			minutesRemaining := int((oneHour - timeSinceLastSameRoute).Minutes())
			return c.Status(429).JSON(fiber.Map{
				"error":            "same_route_cooldown",
				"message":          "You recently booked this same route. Please wait before booking it again.",
				"minutesRemaining": minutesRemaining,
				"waitUntil":        lastSameRouteTime.Add(oneHour).Format(time.RFC3339),
			})
		}
	}

	// RESTRICTION 3: Check for any ride booking (30 minute cooldown)
	var lastAnyRideTime *time.Time
	anyRideQuery := `
		SELECT created_at 
		FROM ride_bills 
		WHERE user_id = $1 
		AND status != 'cancelled'
		ORDER BY created_at DESC 
		LIMIT 1
	`
	err = database.GetPool().QueryRow(ctx, anyRideQuery, userID).Scan(&lastAnyRideTime)
	if err != nil && err != pgx.ErrNoRows {
		log.Printf("[CreateRideBill] Any ride query error: %v", err)
		return c.Status(500).JSON(fiber.Map{
			"error": "failed to check booking history",
		})
	}

	if lastAnyRideTime != nil {
		timeSinceLastRide := time.Since(*lastAnyRideTime)
		thirtyMinutes := 30 * time.Minute

		if timeSinceLastRide < thirtyMinutes {
			minutesRemaining := int((thirtyMinutes - timeSinceLastRide).Minutes())
			return c.Status(429).JSON(fiber.Map{
				"error":            "booking_cooldown",
				"message":          "Please wait before booking another ride.",
				"minutesRemaining": minutesRemaining,
				"waitUntil":        lastAnyRideTime.Add(thirtyMinutes).Format(time.RFC3339),
			})
		}
	}

	// ========== END BOOKING RESTRICTIONS ==========

	// Convert rideId to int (handle both string and int)
	var rideIDInt int
	if req.RideID != nil {
		switch v := req.RideID.(type) {
		case string:
			parsed, err := strconv.Atoi(v)
			if err != nil {
				log.Printf("[CreateRideBill] Invalid rideId string: %v", v)
				return c.Status(400).JSON(fiber.Map{
					"error": "invalid rideId format",
				})
			}
			rideIDInt = parsed
		case float64:
			rideIDInt = int(v)
		case int:
			rideIDInt = v
		default:
			log.Printf("[CreateRideBill] Unexpected rideId type: %T", v)
			return c.Status(400).JSON(fiber.Map{
				"error": "invalid rideId format",
			})
		}
	}

	// If rideId is provided, fetch fare from ride_locations
	if rideIDInt > 0 && req.Fare == 0 {
		var rideFare float64
		err := database.GetPool().QueryRow(ctx,
			"SELECT fare FROM ride_locations WHERE id = $1", rideIDInt).Scan(&rideFare)
		if err == nil {
			req.Fare = rideFare
		} else {
			log.Printf("[CreateRideBill] Could not fetch fare for rideId %d: %v", rideIDInt, err)
		}
	}

	// Insert ride bill
	query := `
		INSERT INTO ride_bills (ride_id, user_id, from_location, to_location, fare, status, driver, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, 'requested', $6, NOW(), NOW())
		RETURNING id, ride_number, created_at, updated_at
	`

	var rideIDArg interface{}
	if rideIDInt > 0 {
		rideIDArg = rideIDInt
	} else {
		rideIDArg = nil
	}

	var id int
	var rideNumber *string
	var createdAt, updatedAt time.Time
	err = database.GetPool().QueryRow(ctx, query,
		rideIDArg, userID, req.FromLocation, req.ToLocation, req.Fare, req.Driver,
	).Scan(&id, &rideNumber, &createdAt, &updatedAt)

	if err != nil {
		log.Printf("[CreateRideBill] Insert error: %v", err)
		return c.Status(500).JSON(fiber.Map{
			"error": "failed to create ride bill",
		})
	}

	response := fiber.Map{
		"_id":          strconv.Itoa(id),
		"userId":       userID,
		"fromLocation": req.FromLocation,
		"toLocation":   req.ToLocation,
		"fare":         req.Fare,
		"status":       "requested",
		"driver":       req.Driver,
		"createdAt":    createdAt.Format(time.RFC3339),
		"updatedAt":    updatedAt.Format(time.RFC3339),
	}

	if rideNumber != nil {
		response["rideNumber"] = *rideNumber
	}
	if rideIDInt > 0 {
		response["rideId"] = rideIDInt
	} else {
		response["rideId"] = nil
	}

	return c.Status(201).JSON(response)
}

// GetRideBillStatistics returns statistics about ride bills
func GetRideBillStatistics(c *fiber.Ctx) error {
	ctx, cancel := database.DefaultTimeout()
	defer cancel()

	if err := checkTableExists(ctx, "ride_bills"); err != nil {
		log.Printf("[GetRideBillStatistics] %v", err)
		msg := err.Error()
		return c.Status(500).JSON(fiber.Map{"error": msg, "message": msg})
	}

	query := `
		SELECT
			COUNT(*) as total_bills,
			COALESCE(SUM(CASE WHEN LOWER(TRIM(status)) IN ('arrived','in_progress','completed') THEN fare ELSE 0 END), 0) as total_revenue,
			COUNT(*) FILTER (WHERE LOWER(TRIM(status)) = 'requested') as pending_bills,
			COUNT(*) FILTER (WHERE LOWER(TRIM(status)) IN ('arrived','in_progress')) as active_bills,
			COUNT(*) FILTER (WHERE LOWER(TRIM(status)) = 'completed') as completed_bills,
			COUNT(*) FILTER (WHERE LOWER(TRIM(status)) = 'cancelled') as cancelled_bills
		FROM ride_bills
	`

	var (
		TotalBills     int
		TotalRevenue   float64
		PendingBills   int
		ActiveBills    int
		CompletedBills int
		CancelledBills int
	)

	err := database.GetPool().QueryRow(ctx, query).Scan(
		&TotalBills, &TotalRevenue, &PendingBills, &ActiveBills, &CompletedBills, &CancelledBills,
	)

	if err != nil {
		log.Printf("[GetRideBillStatistics] Query error: %v", err)
		return c.Status(500).JSON(fiber.Map{
			"error":   "failed to fetch statistics",
			"details": err.Error(),
		})
	}

	stats := fiber.Map{
		"totalBills":     TotalBills,
		"totalRevenue":   TotalRevenue,
		"pendingBills":   PendingBills,
		"activeBills":    ActiveBills,
		"completedBills": CompletedBills,
		"cancelledBills": CancelledBills,
	}

	return c.JSON(stats)
}

// GetRideBillByID returns a single ride bill by ID
func GetRideBillByID(c *fiber.Ctx) error {
	ctx, cancel := database.DefaultTimeout()
	defer cancel()

	id := c.Params("id")
	if id == "" {
		return c.Status(400).JSON(fiber.Map{
			"error": "ride bill id is required",
		})
	}

	query := `
		SELECT 
			rb.id, rb.ride_id, rb.user_id, rb.from_location, rb.to_location,
			rb.fare, rb.status, rb.driver, rb.reason, rb.created_at, rb.updated_at,
			rl.id as rl_id, rl.from_location as rl_from, rl.to_location as rl_to, rl.fare as rl_fare,
			u.id as u_id, u.username, u.email, u.name
		FROM ride_bills rb
		LEFT JOIN ride_locations rl ON rb.ride_id = rl.id
		LEFT JOIN users u ON rb.user_id = u.id
		WHERE rb.id = $1
		LIMIT 1
	`

	var (
		ID        int
		RideID    *int
		UserID    int
		FromLoc   string
		ToLoc     string
		Fare      float64
		Status    string
		Driver    *string
		Reason    *string
		CreatedAt time.Time
		UpdatedAt time.Time
		RLID      *int
		RLFrom    *string
		RLTo      *string
		RLFare    *float64
		UID       *int
		Username  *string
		Email     *string
		Name      *string
	)

	err := database.GetPool().QueryRow(ctx, query, id).Scan(
		&ID, &RideID, &UserID, &FromLoc, &ToLoc, &Fare, &Status, &Driver, &Reason,
		&CreatedAt, &UpdatedAt,
		&RLID, &RLFrom, &RLTo, &RLFare,
		&UID, &Username, &Email, &Name,
	)

	if err != nil {
		if err == pgx.ErrNoRows {
			return c.Status(404).JSON(fiber.Map{
				"error": "ride bill not found",
			})
		}
		log.Printf("[GetRideBillByID] Query error: %v", err)
		return c.Status(500).JSON(fiber.Map{
			"error": "failed to fetch ride bill",
		})
	}

	billMap := fiber.Map{
		"_id":          strconv.Itoa(ID),
		"fromLocation": FromLoc,
		"toLocation":   ToLoc,
		"fare":         Fare,
		"status":       Status,
		"createdAt":    CreatedAt.Format(time.RFC3339),
		"updatedAt":    UpdatedAt.Format(time.RFC3339),
	}

	if RLID != nil {
		billMap["rideId"] = fiber.Map{
			"_id":          strconv.Itoa(*RLID),
			"fromLocation": *RLFrom,
			"toLocation":   *RLTo,
			"fare":         *RLFare,
		}
	} else if RideID != nil {
		billMap["rideId"] = strconv.Itoa(*RideID)
	} else {
		billMap["rideId"] = nil
	}

	if UID != nil {
		userMap := fiber.Map{
			"_id": strconv.Itoa(*UID),
		}
		if Username != nil {
			userMap["username"] = *Username
		}
		if Email != nil {
			userMap["email"] = *Email
		}
		if Name != nil {
			userMap["name"] = *Name
		}
		billMap["userId"] = userMap
	} else {
		billMap["userId"] = strconv.Itoa(UserID)
	}

	if Driver != nil {
		billMap["driver"] = *Driver
	}
	if Reason != nil {
		billMap["reason"] = *Reason
	}

	return c.JSON(billMap)
}

// UpdateRideBillRequest represents a ride bill update request
type UpdateRideBillRequest struct {
	Status *string `json:"status,omitempty"`
	Driver *string `json:"driver,omitempty"`
	Reason *string `json:"reason,omitempty"`
}

// UpdateRideBill updates an existing ride bill
func UpdateRideBill(c *fiber.Ctx) error {
	ctx, cancel := database.DefaultTimeout()
	defer cancel()

	id := c.Params("id")
	if id == "" {
		return c.Status(400).JSON(fiber.Map{
			"error": "ride bill id is required",
		})
	}

	var req UpdateRideBillRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{
			"error": "invalid request body",
		})
	}

	// Build UPDATE query dynamically
	var updates []string
	var args []interface{}
	argIndex := 1

	if req.Status != nil {
		validStatuses := map[string]bool{
			"requested":   true,
			"arrived":     true,
			"in_progress": true,
			"completed":   true,
			"cancelled":   true,
		}
		if !validStatuses[*req.Status] {
			return c.Status(400).JSON(fiber.Map{
				"error": "invalid status. Must be one of: requested, arrived, in_progress, completed, cancelled",
			})
		}
		updates = append(updates, "status = $"+strconv.Itoa(argIndex))
		args = append(args, *req.Status)
		argIndex++
	}

	if req.Driver != nil {
		updates = append(updates, "driver = $"+strconv.Itoa(argIndex))
		args = append(args, *req.Driver)
		argIndex++
	}

	if req.Reason != nil {
		updates = append(updates, "reason = $"+strconv.Itoa(argIndex))
		args = append(args, *req.Reason)
		argIndex++
	}

	if len(updates) == 0 {
		return c.Status(400).JSON(fiber.Map{
			"error": "no fields to update",
		})
	}

	// Check if bill exists
	var existingID int
	checkQuery := `SELECT id FROM ride_bills WHERE id = $1 LIMIT 1`
	err := database.GetPool().QueryRow(ctx, checkQuery, id).Scan(&existingID)
	if err != nil {
		if err == pgx.ErrNoRows {
			return c.Status(404).JSON(fiber.Map{
				"error": "ride bill not found",
			})
		}
		log.Printf("[UpdateRideBill] Check query error: %v", err)
		return c.Status(500).JSON(fiber.Map{
			"error": "failed to check bill",
		})
	}

	// Update the bill
	updateQuery := `
		UPDATE ride_bills
		SET ` + strings.Join(updates, ", ") + `,
			updated_at = NOW()
		WHERE id = $` + strconv.Itoa(argIndex) + `
		RETURNING id, ride_id, user_id, from_location, to_location, fare, status, driver, reason, created_at, updated_at
	`
	args = append(args, id)

	var (
		ID        int
		RideID    *int
		UserID    int
		FromLoc   string
		ToLoc     string
		Fare      float64
		Status    string
		Driver    *string
		Reason    *string
		CreatedAt time.Time
		UpdatedAt time.Time
	)

	err = database.GetPool().QueryRow(ctx, updateQuery, args...).Scan(
		&ID, &RideID, &UserID, &FromLoc, &ToLoc, &Fare, &Status, &Driver, &Reason,
		&CreatedAt, &UpdatedAt,
	)

	if err != nil {
		log.Printf("[UpdateRideBill] Update error: %v", err)
		return c.Status(500).JSON(fiber.Map{
			"error": "failed to update ride bill",
		})
	}

	billMap := fiber.Map{
		"_id":          strconv.Itoa(ID),
		"userId":       strconv.Itoa(UserID),
		"fromLocation": FromLoc,
		"toLocation":   ToLoc,
		"fare":         Fare,
		"status":       Status,
		"createdAt":    CreatedAt.Format(time.RFC3339),
		"updatedAt":    UpdatedAt.Format(time.RFC3339),
	}

	if Driver != nil {
		billMap["driver"] = *Driver
	}
	if Reason != nil {
		billMap["reason"] = *Reason
	}
	if RideID != nil {
		billMap["rideId"] = strconv.Itoa(*RideID)
	} else {
		billMap["rideId"] = nil
	}

	return c.JSON(billMap)
}

// DeleteRideBill deletes a ride bill by ID
func DeleteRideBill(c *fiber.Ctx) error {
	ctx, cancel := database.DefaultTimeout()
	defer cancel()

	id := c.Params("id")
	if id == "" {
		return c.Status(400).JSON(fiber.Map{
			"error": "ride bill id is required",
		})
	}

	// Check if bill exists
	var existingID int
	checkQuery := `SELECT id FROM ride_bills WHERE id = $1 LIMIT 1`
	err := database.GetPool().QueryRow(ctx, checkQuery, id).Scan(&existingID)
	if err != nil {
		if err == pgx.ErrNoRows {
			return c.Status(404).JSON(fiber.Map{
				"error": "ride bill not found",
			})
		}
		log.Printf("[DeleteRideBill] Check query error: %v", err)
		return c.Status(500).JSON(fiber.Map{
			"error": "failed to check bill",
		})
	}

	// Delete the bill
	deleteQuery := `DELETE FROM ride_bills WHERE id = $1`
	_, err = database.GetPool().Exec(ctx, deleteQuery, id)
	if err != nil {
		log.Printf("[DeleteRideBill] Delete error: %v", err)
		return c.Status(500).JSON(fiber.Map{
			"error": "failed to delete ride bill",
		})
	}

	return c.Status(204).Send(nil)
}

// UpdateMyRideBill allows authenticated users to update their own ride bills
// Limited to status updates that make sense for users (e.g., marking as completed)
func UpdateMyRideBill(c *fiber.Ctx) error {
	ctx, cancel := database.DefaultTimeout()
	defer cancel()

	// Get current user ID from session
	userID := c.Locals("userID")
	if userID == nil {
		return c.Status(401).JSON(fiber.Map{
			"error": "unauthorized",
		})
	}

	id := c.Params("id")
	if id == "" {
		return c.Status(400).JSON(fiber.Map{
			"error": "ride bill id is required",
		})
	}

	var req struct {
		Status *string `json:"status,omitempty"`
	}

	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{
			"error": "invalid request body",
		})
	}

	// Validate status - users can mark requested→arrived or in_progress→completed
	if req.Status == nil {
		return c.Status(400).JSON(fiber.Map{
			"error": "status is required",
		})
	}
	if *req.Status != "arrived" && *req.Status != "completed" {
		return c.Status(400).JSON(fiber.Map{
			"error": "users can only mark rides as arrived or completed",
		})
	}

	// Check if bill exists and belongs to the current user
	var existingUserID int
	var existingStatus string
	checkQuery := `SELECT user_id, status FROM ride_bills WHERE id = $1 LIMIT 1`
	err := database.GetPool().QueryRow(ctx, checkQuery, id).Scan(&existingUserID, &existingStatus)
	if err != nil {
		if err == pgx.ErrNoRows {
			return c.Status(404).JSON(fiber.Map{
				"error": "ride bill not found",
			})
		}
		log.Printf("[UpdateMyRideBill] Check query error: %v", err)
		return c.Status(500).JSON(fiber.Map{
			"error": "failed to check bill ownership",
		})
	}

	// Verify ownership
	if existingUserID != userID.(int) {
		return c.Status(403).JSON(fiber.Map{
			"error": "you can only update your own ride bills",
		})
	}

	// Enforce valid transitions: requested→arrived, in_progress→completed
	validTransitions := map[string]string{
		"requested":   "arrived",
		"in_progress": "completed",
	}
	if validTransitions[existingStatus] != *req.Status {
		return c.Status(400).JSON(fiber.Map{
			"error": fmt.Sprintf("cannot transition from %s to %s", existingStatus, *req.Status),
		})
	}

	// Update the bill status
	updateQuery := `
		UPDATE ride_bills
		SET status = $1, updated_at = NOW()
		WHERE id = $2 AND user_id = $3
		RETURNING id, ride_id, user_id, from_location, to_location, fare, status, driver, created_at, updated_at
	`

	var (
		ID        int
		RideID    *int
		UserID    int
		FromLoc   string
		ToLoc     string
		Fare      float64
		Status    string
		Driver    *string
		CreatedAt time.Time
		UpdatedAt time.Time
	)

	err = database.GetPool().QueryRow(ctx, updateQuery, *req.Status, id, userID).Scan(
		&ID, &RideID, &UserID, &FromLoc, &ToLoc, &Fare, &Status, &Driver,
		&CreatedAt, &UpdatedAt,
	)

	if err != nil {
		log.Printf("[UpdateMyRideBill] Update error: %v", err)
		return c.Status(500).JSON(fiber.Map{
			"error": "failed to update ride bill",
		})
	}

	billMap := fiber.Map{
		"_id":          strconv.Itoa(ID),
		"userId":       strconv.Itoa(UserID),
		"fromLocation": FromLoc,
		"toLocation":   ToLoc,
		"fare":         Fare,
		"status":       Status,
		"createdAt":    CreatedAt.Format(time.RFC3339),
		"updatedAt":    UpdatedAt.Format(time.RFC3339),
	}

	if Driver != nil {
		billMap["driver"] = *Driver
	}
	if RideID != nil {
		billMap["rideId"] = strconv.Itoa(*RideID)
	} else {
		billMap["rideId"] = nil
	}

	return c.JSON(billMap)
}
