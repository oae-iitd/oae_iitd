package handlers

import (
	"fmt"
	"log"
	"strconv"
	"strings"

	"github.com/gofiber/fiber/v2"

	"github.com/server/internal/auth"
	"github.com/server/internal/cache"
	"github.com/server/internal/config"
	"github.com/server/internal/database"
	"github.com/server/internal/middleware"
	"github.com/server/internal/twilio"
)

// DriverHealth returns 200 if driver OTP endpoints are available (no auth required)
func DriverHealth(c *fiber.Ctx) error {
	return c.JSON(fiber.Map{"driver_otp": true})
}

// DriverGo serves a redirect page for /go/driver/:id. When opened on mobile (Android/iOS),
// tries to open the student app via deep link; if app not installed, redirects to store. Avoids web.
func DriverGo(c *fiber.Ctx) error {
	idStr := c.Params("id")
	if idStr == "" {
		return c.Status(400).SendString("driver id required")
	}
	id, err := strconv.Atoi(idStr)
	if err != nil {
		return c.Status(400).SendString("invalid driver id")
	}
	ctx, cancel := database.DefaultTimeout()
	defer cancel()
	var one int
	q := `SELECT 1 FROM users WHERE id = $1 AND LOWER(role) = 'driver' AND status = 'active' LIMIT 1`
	err = database.GetPool().QueryRow(ctx, q, id).Scan(&one)
	if err != nil {
		return c.Status(404).SendString("driver not found")
	}
	scheme := config.AppScheme()
	appLink := scheme + "://driver/" + idStr
	playStore := config.PlayStoreURL()
	appStore := config.AppStoreURL()
	html := `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
		`<script>` +
		`var appLink="` + appLink + `", playStore="` + playStore + `", appStore="` + appStore + `";` +
		`var ua=navigator.userAgent; var isAndroid=/Android/i.test(ua); var isIOS=/iPhone|iPad|iPod/i.test(ua);` +
		`if(isAndroid){ window.location=appLink; setTimeout(function(){ window.location=playStore; }, 2200); }` +
		`else if(isIOS){ window.location=appLink; setTimeout(function(){ window.location=appStore; }, 2200); }` +
		`</script>` +
		`<title>Open in app</title></head><body style="font-family:sans-serif;text-align:center;padding:2rem;">` +
		`<p>Open this link on your phone to book a ride.</p>` +
		`<p><a href="` + playStore + `">Get Android app</a> &middot; <a href="` + appStore + `">Get iOS app</a></p>` +
		`</body></html>`
	c.Set("Content-Type", "text/html; charset=utf-8")
	return c.SendString(html)
}

// DriverQR returns driver info for a QR code scan (public, no auth). Students scan the driver's QR to get ID, name, profilePicture for booking.
// QR URL format: https://<hostname>/api/driver/qr/<driverId>
func DriverQR(c *fiber.Ctx) error {
	idStr := c.Params("id")
	if idStr == "" {
		return c.Status(400).JSON(fiber.Map{"error": "driver id required"})
	}
	id, err := strconv.Atoi(idStr)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid driver id"})
	}

	ctx, cancel := database.DefaultTimeout()
	defer cancel()

	var name, profilePicture *string
	q := `SELECT name, profile_picture FROM users WHERE id = $1 AND LOWER(role) = 'driver' AND status = 'active' LIMIT 1`
	err = database.GetPool().QueryRow(ctx, q, id).Scan(&name, &profilePicture)
	if err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "driver not found"})
	}

	out := fiber.Map{
		"driverId": idStr,
		"message":  "Use this driver when booking your ride",
	}
	if name != nil {
		out["name"] = *name
	}
	if profilePicture != nil {
		out["profilePicture"] = *profilePicture
	}
	return c.JSON(out)
}

// DriverSendOTPRequest is the request body for driver send OTP
type DriverSendOTPRequest struct {
	Phone string `json:"phone"`
}

// DriverSendOTPResponse is the response for driver send OTP
type DriverSendOTPResponse struct {
	Message   string `json:"message"`
	RequestID string `json:"request_id,omitempty"`
}

// DriverSendOTP sends OTP to driver's phone via Twilio
func DriverSendOTP(c *fiber.Ctx) error {
	ctx, cancel := database.DefaultTimeout()
	defer cancel()

	var req DriverSendOTPRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid request body"})
	}

	phone := normalizePhone(req.Phone)
	if phone == "" {
		return c.Status(400).JSON(fiber.Map{"error": "phone is required"})
	}

	// Driver app only: must be a driver (by phone). Students use the student app (email/password).
	user, err := auth.GetUserByPhoneAndRole(ctx, phone, "Driver")
	if err != nil {
		if err == auth.ErrUserNotFound {
			return c.Status(404).JSON(fiber.Map{
				"error":   "driver not found for this phone number",
				"message": "This number is not registered as a driver. Driver app is for driver numbers only, not students.",
			})
		}
		log.Printf("[DriverSendOTP] GetUserByPhoneAndRole: %v", err)
		return c.Status(500).JSON(fiber.Map{"error": "internal server error"})
	}
	if !strings.EqualFold(user.Role, "driver") {
		log.Printf("[DriverSendOTP] Rejecting: user id=%d has role %q", user.ID, user.Role)
		return c.Status(404).JSON(fiber.Map{
			"error":   "driver not found for this phone number",
			"message": "This number is not registered as a driver. Driver app is for driver numbers only.",
		})
	}

	otp := cache.GenerateOTP()
	if err := cache.SetDriverOTP(ctx, phone, otp); err != nil {
		log.Printf("[DriverSendOTP] SetDriverOTP: %v", err)
		return c.Status(500).JSON(fiber.Map{"error": "failed to generate OTP"})
	}

	message := fmt.Sprintf(config.SMSOTPTemplate(), otp)
	if err := twilio.SendSMS(ctx, phone, message); err != nil {
		log.Printf("[DriverSendOTP] SendSMS: %v", err)
		// Still return success; OTP is stored and can be verified (e.g. for testing without Twilio)
	}

	log.Printf("[DriverSendOTP] OTP sent to driver %d (phone %s)", user.ID, phone)
	requestID := middleware.GetRequestID(c)
	return c.JSON(DriverSendOTPResponse{
		Message:   "OTP sent successfully",
		RequestID: requestID,
	})
}

// DriverVerifyOTPRequest is the request body for driver verify OTP
type DriverVerifyOTPRequest struct {
	Phone string `json:"phone"`
	OTP   string `json:"otp"`
}

// DriverVerifyOTPResponse is the response for driver verify OTP (returns token for dashboard)
type DriverVerifyOTPResponse struct {
	Valid     bool   `json:"valid"`
	Message   string `json:"message"`
	Token     string `json:"token,omitempty"`
	RequestID string `json:"request_id,omitempty"`
}

// DriverVerifyOTP verifies OTP and returns a session token for the driver
func DriverVerifyOTP(c *fiber.Ctx) error {
	ctx, cancel := database.DefaultTimeout()
	defer cancel()

	var req DriverVerifyOTPRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid request body"})
	}

	phone := normalizePhone(req.Phone)
	if phone == "" || req.OTP == "" {
		return c.Status(400).JSON(fiber.Map{"error": "phone and otp are required"})
	}

	valid, err := cache.VerifyDriverOTP(ctx, phone, req.OTP)
	if err != nil || !valid {
		requestID := middleware.GetRequestID(c)
		return c.Status(400).JSON(DriverVerifyOTPResponse{
			Valid:     false,
			Message:   "Invalid or expired OTP",
			RequestID: requestID,
		})
	}

	user, err := auth.GetUserByPhoneAndRole(ctx, phone, "Driver")
	if err != nil {
		if err == auth.ErrUserNotFound {
			return c.Status(404).JSON(fiber.Map{
				"error":   "driver not found for this phone number",
				"message": "This number is not registered as a driver. Driver app is for driver numbers only.",
			})
		}
		log.Printf("[DriverVerifyOTP] GetUserByPhoneAndRole: %v", err)
		return c.Status(500).JSON(fiber.Map{"error": "internal server error"})
	}
	// Ensure we never create a driver session for a non-driver (e.g. wrong role in DB or phone match)
	if !strings.EqualFold(user.Role, "driver") {
		log.Printf("[DriverVerifyOTP] Rejecting login: user id=%d has role %q, not Driver", user.ID, user.Role)
		return c.Status(403).JSON(fiber.Map{
			"error":   "forbidden",
			"message": "This phone number is not registered as a driver.",
		})
	}

	token, err := auth.CreateSessionForUser(ctx, user, "mobile-app")
	if err != nil {
		log.Printf("[DriverVerifyOTP] CreateSessionForUser: %v", err)
		return c.Status(500).JSON(fiber.Map{"error": "failed to create session"})
	}

	_ = cache.DeleteDriverOTP(ctx, phone)

	requestID := middleware.GetRequestID(c)
	return c.JSON(DriverVerifyOTPResponse{
		Valid:     true,
		Message:   "Login successful",
		Token:     token,
		RequestID: requestID,
	})
}

// normalizePhone trims and ensures E.164 format (e.g. +919876543210)
func normalizePhone(phone string) string {
	s := ""
	for _, r := range phone {
		if (r >= '0' && r <= '9') || r == '+' {
			s += string(r)
		}
	}
	if s == "" {
		return ""
	}
	if s[0] == '+' {
		return s
	}
	// 10 digits: assume India
	if len(s) == 10 {
		return "+91" + s
	}
	if len(s) == 12 && s[:2] == "91" {
		return "+" + s
	}
	return "+" + s
}
