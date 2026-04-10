package handlers

import (
	"log"

	"github.com/gofiber/fiber/v2"

	"github.com/server/internal/database"
	"github.com/server/internal/middleware"
)

// GetPreferences returns the current user's preferences.
func GetPreferences(c *fiber.Ctx) error {
	ctx, cancel := database.DefaultTimeout()
	defer cancel()

	session := middleware.GetSession(c)
	if session == nil {
		return c.Status(401).JSON(fiber.Map{"error": "unauthorized"})
	}

	prefs, err := database.GetUserPreferences(ctx, session.UserID)
	if err != nil {
		log.Printf("[GetPreferences] Error fetching preferences: %v", err)
		return c.Status(500).JSON(fiber.Map{"error": "failed to fetch preferences"})
	}

	return c.JSON(fiber.Map{
		"preferences": fiber.Map{
			"accentColor":         prefs.AccentColor,
			"theme":               prefs.Theme,
			"notifEmail":          prefs.NotifEmail,
			"notifRideUpdates":    prefs.NotifRideUpdates,
			"notifSecurityAlerts": prefs.NotifSecurityAlerts,
		},
		"request_id": middleware.GetRequestID(c),
	})
}

// UpdatePreferencesRequest represents a request to update user preferences.
type UpdatePreferencesRequest struct {
	AccentColor         string `json:"accentColor"`
	Theme               string `json:"theme"`
	NotifEmail          *bool  `json:"notifEmail"`
	NotifRideUpdates    *bool  `json:"notifRideUpdates"`
	NotifSecurityAlerts *bool  `json:"notifSecurityAlerts"`
}

// UpdatePreferences updates the current user's preferences.
func UpdatePreferences(c *fiber.Ctx) error {
	ctx, cancel := database.DefaultTimeout()
	defer cancel()

	session := middleware.GetSession(c)
	if session == nil {
		return c.Status(401).JSON(fiber.Map{"error": "unauthorized"})
	}

	var req UpdatePreferencesRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid request body"})
	}

	// Validate accent color
	validColors := map[string]bool{
		"blue": true, "indigo": true, "purple": true, "violet": true,
		"fuchsia": true, "pink": true, "rose": true, "red": true,
		"orange": true, "amber": true, "yellow": true, "lime": true,
		"green": true, "emerald": true, "teal": true, "cyan": true, "sky": true,
	}
	if req.AccentColor != "" && !validColors[req.AccentColor] {
		return c.Status(400).JSON(fiber.Map{
			"error": "invalid accent color",
		})
	}

	// Validate theme
	validThemes := map[string]bool{"light": true, "dark": true, "system": true}
	if req.Theme != "" && !validThemes[req.Theme] {
		return c.Status(400).JSON(fiber.Map{"error": "invalid theme"})
	}

	// Load existing values so partial updates don't overwrite other fields
	prefs, err := database.GetUserPreferences(ctx, session.UserID)
	if err != nil {
		log.Printf("[UpdatePreferences] Error fetching existing preferences: %v", err)
		prefs, err = database.CreateDefaultPreferences(ctx, session.UserID)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": "failed to initialize preferences"})
		}
	}

	accentColor := prefs.AccentColor
	if req.AccentColor != "" {
		accentColor = req.AccentColor
	}

	theme := prefs.Theme
	if req.Theme != "" {
		theme = req.Theme
	}

	notifEmail := prefs.NotifEmail
	if req.NotifEmail != nil {
		notifEmail = *req.NotifEmail
	}

	notifRideUpdates := prefs.NotifRideUpdates
	if req.NotifRideUpdates != nil {
		notifRideUpdates = *req.NotifRideUpdates
	}

	notifSecurityAlerts := prefs.NotifSecurityAlerts
	if req.NotifSecurityAlerts != nil {
		notifSecurityAlerts = *req.NotifSecurityAlerts
	}

	if err := database.UpdateUserPreferences(ctx, session.UserID,
		accentColor, theme, notifEmail, notifRideUpdates, notifSecurityAlerts,
	); err != nil {
		log.Printf("[UpdatePreferences] Error updating preferences: %v", err)
		return c.Status(500).JSON(fiber.Map{"error": "failed to update preferences"})
	}

	return c.JSON(fiber.Map{
		"message": "Preferences updated successfully",
		"preferences": fiber.Map{
			"accentColor":         accentColor,
			"theme":               theme,
			"notifEmail":          notifEmail,
			"notifRideUpdates":    notifRideUpdates,
			"notifSecurityAlerts": notifSecurityAlerts,
		},
		"request_id": middleware.GetRequestID(c),
	})
}
