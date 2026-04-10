package handlers

import (
	"log"
	"strconv"

	"github.com/gofiber/fiber/v2"

	"github.com/server/internal/database"
)

// GetDriverRideBills returns ride bills assigned to the authenticated driver.
// Students store the selected driver id in ride_bills.driver as a string.
func GetDriverRideBills(c *fiber.Ctx) error {
	ctx, cancel := database.DefaultTimeout()
	defer cancel()

	userIDAny := c.Locals("userID")
	if userIDAny == nil {
		return c.Status(401).JSON(fiber.Map{"error": "unauthorized"})
	}

	driverID, ok := userIDAny.(int)
	if !ok {
		// Defensive: middleware sets int, but avoid panics if this changes.
		return c.Status(401).JSON(fiber.Map{"error": "unauthorized"})
	}

	// Optional filter: status=pending|paid|cancelled|completed|all
	status := c.Query("status", "")

	// Reuse the ride bills join query so the driver can see student details.
	query := buildRideBillQuery() + " AND rb.driver = $" + strconv.Itoa(1)
	args := []interface{}{strconv.Itoa(driverID)}
	argIndex := 2

	if status != "" && status != "all" {
		query += " AND rb.status = $" + strconv.Itoa(argIndex)
		args = append(args, status)
	}

	query += " ORDER BY rb.created_at DESC"

	rows, err := database.GetPool().Query(ctx, query, args...)
	if err != nil {
		log.Printf("[GetDriverRideBills] Query error: %v", err)
		return c.Status(500).JSON(fiber.Map{
			"error":   "failed to fetch driver ride bills",
			"details": err.Error(),
		})
	}
	defer rows.Close()

	var bills []fiber.Map
	for rows.Next() {
		rideBill, err := scanRideBill(rows)
		if err != nil {
			log.Printf("[GetDriverRideBills] Scan error: %v", err)
			continue
		}
		bills = append(bills, rideBill.toMap())
	}

	if err := rows.Err(); err != nil {
		log.Printf("[GetDriverRideBills] Rows error: %v", err)
		return c.Status(500).JSON(fiber.Map{
			"error":   "failed to process driver ride bills",
			"details": err.Error(),
		})
	}

	if bills == nil {
		bills = []fiber.Map{}
	}

	return c.JSON(bills)
}
