package middleware

import (
	"log"
	"strings"

	"github.com/gofiber/fiber/v2"

	"github.com/server/internal/auth"
	"github.com/server/internal/database"
)

func normalizedClientType(raw string) string {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "mobile-app", "driver-mobile":
		return "mobile-app"
	default:
		return "web-admin"
	}
}

// clientMatchesSession allows the X-Client header to differ from the session's stored client
// in one legacy case: the student/driver mobile app always sends "mobile-app", but older
// logins (or clients that omitted X-Client) created sessions with "web-admin". Rejecting
// those requests caused 403 on every authenticated API call from the Expo app.
func clientMatchesSession(session *auth.Session, xClientHeader string) bool {
	if session == nil {
		return false
	}
	req := normalizedClientType(xClientHeader)
	sess := normalizedClientType(session.Client)
	if req == sess {
		return true
	}
	// Legacy: mobile request + session stored as web-admin for non-admin users
	if req == "mobile-app" && sess == "web-admin" {
		role := strings.ToLower(strings.TrimSpace(session.Role))
		if role == "student" || role == "driver" {
			return true
		}
	}
	return false
}

// getSessionID extracts session ID from cookie or Authorization header.
// When X-Client: driver-mobile is set, we use only Bearer so the driver app
// is never tied to a student session_id cookie (e.g. from same browser).
func getSessionID(c *fiber.Ctx) string {
	authHeader := c.Get("Authorization")
	if strings.HasPrefix(authHeader, "Bearer ") {
		return strings.TrimPrefix(authHeader, "Bearer ")
	}
	// Driver app must send Bearer; for web/student app use cookie next
	if c.Get("X-Client") == "driver-mobile" {
		return ""
	}
	sessionID := c.Cookies("session_id")
	if sessionID != "" {
		return sessionID
	}
	return ""
}

// RequireAuth middleware checks if the user is authenticated
func RequireAuth() fiber.Handler {
	return func(c *fiber.Ctx) error {
		path := c.Path()
		// Driver OTP endpoints are public - never require auth
		if strings.HasPrefix(path, "/api/driver/") {
			return c.Next()
		}

		// Get session ID from cookie or Authorization header
		sessionID := getSessionID(c)

		// Debug: log auth info
		log.Printf("[Auth] Path: %s, SessionID: %q (from cookie or bearer)",
			path, sessionID)

		if sessionID == "" {
			return c.Status(401).JSON(fiber.Map{
				"error": "unauthorized",
			})
		}

		// Get session from Redis
		ctx, cancel := database.DefaultTimeout()
		defer cancel()

		session, err := auth.GetSession(ctx, sessionID)
		if err != nil {
			return c.Status(401).JSON(fiber.Map{
				"error": "unauthorized",
			})
		}

		// Update last active timestamp in database (non-blocking)
		go func() {
			updateCtx, cancel := database.DefaultTimeout()
			defer cancel()
			_ = database.UpdateSessionLastActive(updateCtx, sessionID)
		}()

		// Store session in context
		c.Locals("session", session)
		c.Locals("userID", session.UserID)
		c.Locals("userRole", session.Role)

		if !clientMatchesSession(session, c.Get("X-Client")) {
			return c.Status(403).JSON(fiber.Map{
				"error": "forbidden",
			})
		}

		return c.Next()
	}
}

// RequireRole middleware checks if the user has the required role
// It also performs authentication check inline (not by calling RequireAuth)
func RequireRole(roles ...string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		// Get session ID from cookie or Authorization header
		sessionID := getSessionID(c)

		log.Printf("[Auth] RequireRole - Path: %s, SessionID: %q", c.Path(), sessionID)

		if sessionID == "" {
			return c.Status(401).JSON(fiber.Map{
				"error": "unauthorized",
			})
		}

		// Get session from Redis
		ctx, cancel := database.DefaultTimeout()
		defer cancel()

		session, err := auth.GetSession(ctx, sessionID)
		if err != nil {
			log.Printf("[Auth] RequireRole - Session not found: %v", err)
			return c.Status(401).JSON(fiber.Map{
				"error": "unauthorized",
			})
		}

		// Update last active timestamp in database (non-blocking)
		go func() {
			updateCtx, cancel := database.DefaultTimeout()
			defer cancel()
			_ = database.UpdateSessionLastActive(updateCtx, sessionID)
		}()

		// Store session in context
		c.Locals("session", session)
		c.Locals("userID", session.UserID)
		c.Locals("userRole", session.Role)

		if !clientMatchesSession(session, c.Get("X-Client")) {
			return c.Status(403).JSON(fiber.Map{
				"error": "forbidden",
			})
		}

		// Check if user has required role
		for _, role := range roles {
			if strings.EqualFold(session.Role, role) {
				return c.Next()
			}
		}

		log.Printf("[Auth] RequireRole - User role %s not in allowed roles %v", session.Role, roles)
		return c.Status(403).JSON(fiber.Map{
			"error": "forbidden",
		})
	}
}

// GetSession retrieves the session from the context
func GetSession(c *fiber.Ctx) *auth.Session {
	if session, ok := c.Locals("session").(*auth.Session); ok {
		return session
	}
	return nil
}
