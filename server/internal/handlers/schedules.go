package handlers

import (
	"log"
	"strconv"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"

	"github.com/server/internal/database"
)

// scheduleRow represents a schedule row from the database
type scheduleRow struct {
	ID        int
	UserID    int
	Title     string
	DayOfWeek int
	StartTime string
	EndTime   string
	Room      *string
	Type      string
	CreatedAt time.Time
	UpdatedAt time.Time
}

func (r *scheduleRow) toMap() fiber.Map {
	m := fiber.Map{
		"_id":        strconv.Itoa(r.ID),
		"title":      r.Title,
		"dayOfWeek":  r.DayOfWeek,
		"startTime":  r.StartTime,
		"endTime":    r.EndTime,
		"type":       r.Type,
		"createdAt":  r.CreatedAt.Format(time.RFC3339),
		"updatedAt":  r.UpdatedAt.Format(time.RFC3339),
	}
	if r.Room != nil {
		m["room"] = *r.Room
	}
	return m
}

// GetSchedules returns schedule items for the current user
func GetSchedules(c *fiber.Ctx) error {
	ctx, cancel := database.DefaultTimeout()
	defer cancel()

	userID := c.Locals("userID")
	if userID == nil {
		return c.Status(401).JSON(fiber.Map{"error": "unauthorized"})
	}

	uid, ok := userID.(int)
	if !ok {
		return c.Status(401).JSON(fiber.Map{"error": "unauthorized"})
	}

	if err := checkTableExists(ctx, "schedules"); err != nil {
		log.Printf("[GetSchedules] %v", err)
		return c.JSON([]fiber.Map{})
	}

	query := `
		SELECT id, user_id, title, day_of_week, start_time, end_time, room, type, created_at, updated_at
		FROM schedules
		WHERE user_id = $1
		ORDER BY day_of_week, start_time
	`
	dayOfWeek := c.Query("dayOfWeek")
	if dayOfWeek != "" {
		if d, err := strconv.Atoi(dayOfWeek); err == nil && d >= 0 && d <= 6 {
			query = `
				SELECT id, user_id, title, day_of_week, start_time, end_time, room, type, created_at, updated_at
				FROM schedules
				WHERE user_id = $1 AND day_of_week = $2
				ORDER BY start_time
			`
			rows, err := database.GetPool().Query(ctx, query, uid, d)
			if err != nil {
				log.Printf("[GetSchedules] Query error: %v", err)
				return c.Status(500).JSON(fiber.Map{"error": "failed to fetch schedules"})
			}
			defer rows.Close()
			var list []fiber.Map
			for rows.Next() {
				var r scheduleRow
				var room *string
				err := rows.Scan(&r.ID, &r.UserID, &r.Title, &r.DayOfWeek, &r.StartTime, &r.EndTime, &room, &r.Type, &r.CreatedAt, &r.UpdatedAt)
				if err != nil {
					log.Printf("[GetSchedules] Scan error: %v", err)
					continue
				}
				r.Room = room
				list = append(list, r.toMap())
			}
			return c.JSON(list)
		}
	}

	rows, err := database.GetPool().Query(ctx, query, uid)
	if err != nil {
		log.Printf("[GetSchedules] Query error: %v", err)
		return c.Status(500).JSON(fiber.Map{"error": "failed to fetch schedules"})
	}
	defer rows.Close()

	var list []fiber.Map
	for rows.Next() {
		var r scheduleRow
		var room *string
		err := rows.Scan(&r.ID, &r.UserID, &r.Title, &r.DayOfWeek, &r.StartTime, &r.EndTime, &room, &r.Type, &r.CreatedAt, &r.UpdatedAt)
		if err != nil {
			log.Printf("[GetSchedules] Scan error: %v", err)
			continue
		}
		r.Room = room
		list = append(list, r.toMap())
	}
	return c.JSON(list)
}

// GetScheduleByID returns a single schedule item by ID (must belong to current user)
func GetScheduleByID(c *fiber.Ctx) error {
	ctx, cancel := database.DefaultTimeout()
	defer cancel()

	userID := c.Locals("userID")
	if userID == nil {
		return c.Status(401).JSON(fiber.Map{"error": "unauthorized"})
	}
	uid, ok := userID.(int)
	if !ok {
		return c.Status(401).JSON(fiber.Map{"error": "unauthorized"})
	}

	id := c.Params("id")
	if id == "" {
		return c.Status(400).JSON(fiber.Map{"error": "schedule id is required"})
	}

	if err := checkTableExists(ctx, "schedules"); err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "schedule not found"})
	}

	query := `
		SELECT id, user_id, title, day_of_week, start_time, end_time, room, type, created_at, updated_at
		FROM schedules WHERE id = $1 AND user_id = $2
	`
	var r scheduleRow
	var room *string
	err := database.GetPool().QueryRow(ctx, query, id, uid).Scan(
		&r.ID, &r.UserID, &r.Title, &r.DayOfWeek, &r.StartTime, &r.EndTime, &room, &r.Type, &r.CreatedAt, &r.UpdatedAt,
	)
	if err == pgx.ErrNoRows {
		return c.Status(404).JSON(fiber.Map{"error": "schedule not found"})
	}
	if err != nil {
		log.Printf("[GetScheduleByID] Query error: %v", err)
		return c.Status(500).JSON(fiber.Map{"error": "failed to fetch schedule"})
	}
	r.Room = room
	return c.JSON(r.toMap())
}

// CreateScheduleRequest is the JSON body for creating a schedule item
type CreateScheduleRequest struct {
	Title     string `json:"title"`
	DayOfWeek int    `json:"dayOfWeek"`
	StartTime string `json:"startTime"`
	EndTime   string `json:"endTime"`
	Room      string `json:"room"`
	Type      string `json:"type"`
}

// CreateSchedule creates a new schedule item for the current user
func CreateSchedule(c *fiber.Ctx) error {
	ctx, cancel := database.DefaultTimeout()
	defer cancel()

	userID := c.Locals("userID")
	if userID == nil {
		return c.Status(401).JSON(fiber.Map{"error": "unauthorized"})
	}
	uid, ok := userID.(int)
	if !ok {
		return c.Status(401).JSON(fiber.Map{"error": "unauthorized"})
	}

	var req CreateScheduleRequest
	if err := c.BodyParser(&req); err != nil {
		log.Printf("[CreateSchedule] BodyParser error: %v", err)
		return c.Status(400).JSON(fiber.Map{"error": "invalid request body"})
	}

	if req.StartTime == "" || req.EndTime == "" {
		return c.Status(400).JSON(fiber.Map{"error": "startTime and endTime are required"})
	}
	if req.DayOfWeek < 0 || req.DayOfWeek > 6 {
		return c.Status(400).JSON(fiber.Map{"error": "dayOfWeek must be 0-6"})
	}
	schType := req.Type
	if schType == "" {
		schType = "lecture"
	}
	if schType != "lecture" && schType != "tutorial" && schType != "lab" && schType != "exam" {
		return c.Status(400).JSON(fiber.Map{"error": "type must be lecture, tutorial, lab, or exam"})
	}

	if err := checkTableExists(ctx, "schedules"); err != nil {
		log.Printf("[CreateSchedule] %v", err)
		return c.Status(500).JSON(fiber.Map{"error": "schedules table not available"})
	}

	query := `
		INSERT INTO schedules (user_id, title, day_of_week, start_time, end_time, room, type, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, NULLIF(TRIM($6), ''), $7, NOW(), NOW())
		RETURNING id, user_id, title, day_of_week, start_time, end_time, room, type, created_at, updated_at
	`
	var r scheduleRow
	var room *string
	err := database.GetPool().QueryRow(ctx, query,
		uid, req.Title, req.DayOfWeek, req.StartTime, req.EndTime, req.Room, schType,
	).Scan(&r.ID, &r.UserID, &r.Title, &r.DayOfWeek, &r.StartTime, &r.EndTime, &room, &r.Type, &r.CreatedAt, &r.UpdatedAt)
	if err != nil {
		log.Printf("[CreateSchedule] Insert error: %v", err)
		return c.Status(500).JSON(fiber.Map{"error": "failed to create schedule"})
	}
	r.Room = room
	return c.Status(201).JSON(r.toMap())
}

// UpdateSchedule updates an existing schedule item (must belong to current user)
func UpdateSchedule(c *fiber.Ctx) error {
	ctx, cancel := database.DefaultTimeout()
	defer cancel()

	userID := c.Locals("userID")
	if userID == nil {
		return c.Status(401).JSON(fiber.Map{"error": "unauthorized"})
	}
	uid, ok := userID.(int)
	if !ok {
		return c.Status(401).JSON(fiber.Map{"error": "unauthorized"})
	}

	id := c.Params("id")
	if id == "" {
		return c.Status(400).JSON(fiber.Map{"error": "schedule id is required"})
	}

	var req struct {
		Title     *string `json:"title"`
		DayOfWeek *int    `json:"dayOfWeek"`
		StartTime *string `json:"startTime"`
		EndTime   *string `json:"endTime"`
		Room      *string `json:"room"`
		Type      *string `json:"type"`
	}
	if err := c.BodyParser(&req); err != nil {
		log.Printf("[UpdateSchedule] BodyParser error: %v", err)
		return c.Status(400).JSON(fiber.Map{"error": "invalid request body"})
	}

	if err := checkTableExists(ctx, "schedules"); err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "schedule not found"})
	}

	// Build update from non-nil fields
	query := `UPDATE schedules SET updated_at = NOW()`
	args := []interface{}{}
	argIndex := 1
	if req.Title != nil {
		query += `, title = $` + strconv.Itoa(argIndex)
		args = append(args, *req.Title)
		argIndex++
	}
	if req.DayOfWeek != nil {
		if *req.DayOfWeek < 0 || *req.DayOfWeek > 6 {
			return c.Status(400).JSON(fiber.Map{"error": "dayOfWeek must be 0-6"})
		}
		query += `, day_of_week = $` + strconv.Itoa(argIndex)
		args = append(args, *req.DayOfWeek)
		argIndex++
	}
	if req.StartTime != nil {
		query += `, start_time = $` + strconv.Itoa(argIndex)
		args = append(args, *req.StartTime)
		argIndex++
	}
	if req.EndTime != nil {
		query += `, end_time = $` + strconv.Itoa(argIndex)
		args = append(args, *req.EndTime)
		argIndex++
	}
	if req.Room != nil {
		query += `, room = NULLIF(TRIM($` + strconv.Itoa(argIndex) + `), '')`
		args = append(args, *req.Room)
		argIndex++
	}
	if req.Type != nil {
		t := *req.Type
		if t != "lecture" && t != "tutorial" && t != "lab" && t != "exam" {
			return c.Status(400).JSON(fiber.Map{"error": "type must be lecture, tutorial, lab, or exam"})
		}
		query += `, type = $` + strconv.Itoa(argIndex)
		args = append(args, t)
		argIndex++
	}

	query += ` WHERE id = $` + strconv.Itoa(argIndex) + ` AND user_id = $` + strconv.Itoa(argIndex+1) + ` RETURNING id, user_id, title, day_of_week, start_time, end_time, room, type, created_at, updated_at`
	args = append(args, id, uid)

	row := database.GetPool().QueryRow(ctx, query, args...)
	var r scheduleRow
	var room *string
	err := row.Scan(&r.ID, &r.UserID, &r.Title, &r.DayOfWeek, &r.StartTime, &r.EndTime, &room, &r.Type, &r.CreatedAt, &r.UpdatedAt)
	if err == pgx.ErrNoRows {
		return c.Status(404).JSON(fiber.Map{"error": "schedule not found"})
	}
	if err != nil {
		log.Printf("[UpdateSchedule] Update error: %v", err)
		return c.Status(500).JSON(fiber.Map{"error": "failed to update schedule"})
	}
	r.Room = room
	return c.JSON(r.toMap())
}

// DeleteSchedule deletes a schedule item (must belong to current user)
func DeleteSchedule(c *fiber.Ctx) error {
	ctx, cancel := database.DefaultTimeout()
	defer cancel()

	userID := c.Locals("userID")
	if userID == nil {
		return c.Status(401).JSON(fiber.Map{"error": "unauthorized"})
	}
	uid, ok := userID.(int)
	if !ok {
		return c.Status(401).JSON(fiber.Map{"error": "unauthorized"})
	}

	id := c.Params("id")
	if id == "" {
		return c.Status(400).JSON(fiber.Map{"error": "schedule id is required"})
	}

	if err := checkTableExists(ctx, "schedules"); err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "schedule not found"})
	}

	cmd, err := database.GetPool().Exec(ctx, `DELETE FROM schedules WHERE id = $1 AND user_id = $2`, id, uid)
	if err != nil {
		log.Printf("[DeleteSchedule] Delete error: %v", err)
		return c.Status(500).JSON(fiber.Map{"error": "failed to delete schedule"})
	}
	if cmd.RowsAffected() == 0 {
		return c.Status(404).JSON(fiber.Map{"error": "schedule not found"})
	}
	return c.SendStatus(204)
}
