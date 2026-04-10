package main

import (
	"log"
	"os"
	"os/signal"
	"strings"
	"syscall"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/gofiber/fiber/v2/middleware/recover"

	"github.com/server/internal/cache"
	"github.com/server/internal/config"
	"github.com/server/internal/database"
	"github.com/server/internal/handlers"
	"github.com/server/internal/middleware"
)

func main() {
	// Initialize configuration
	config.Init()

	// Connect to database
	database.Connect(config.DatabaseURL())

	// Connect to Redis
	cache.Connect(config.RedisAddr(), config.RedisPassword(), config.RedisDB())

	// Create Fiber app
	app := fiber.New(fiber.Config{
		AppName:      config.AppName(),
		ErrorHandler: customErrorHandler,
		BodyLimit:    50 * 1024 * 1024, // 50MB
	})

	// Middleware
	app.Use(recover.New())
	app.Use(logger.New(logger.Config{
		Format: "[${time}] ${status} - ${method} ${path} (${latency})\n",
	}))
	// CORS configuration
	allowedOrigins := normalizeAllowedOrigins(os.Getenv("CORS_ORIGINS"))
	allowCredentials := true
	if allowedOrigins == "" || allowedOrigins == "*" {
		// In production without explicit origins, disable credentials for security
		allowedOrigins = "*"
		allowCredentials = false
	}
	app.Use(cors.New(cors.Config{
		AllowOrigins:     allowedOrigins,
		AllowMethods:     "GET,POST,PUT,DELETE,OPTIONS,PATCH",
		AllowHeaders:     "Origin,Content-Type,Accept,Authorization,X-Request-ID,X-Client",
		AllowCredentials: allowCredentials,
	}))
	// Fallback CORS headers for edge/proxy setups that may drop Origin passthrough.
	app.Use(func(c *fiber.Ctx) error {
		err := c.Next()
		if c.GetRespHeader("Access-Control-Allow-Origin") == "" {
			origin := c.Get("Origin")
			if allowCredentials && origin != "" && allowedOrigins != "*" {
				c.Set("Access-Control-Allow-Origin", origin)
				c.Append("Vary", "Origin")
				c.Set("Access-Control-Allow-Credentials", "true")
			} else {
				c.Set("Access-Control-Allow-Origin", "*")
			}
			c.Set("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS,PATCH")
			c.Set("Access-Control-Allow-Headers", "Origin,Content-Type,Accept,Authorization,X-Request-ID,X-Client")
		}
		return err
	})
	app.Use(middleware.RequestID())

	// Health check endpoint
	app.Get("/", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{
			"status": "ok",
			"app":    config.AppName(),
		})
	})
	app.Get("/health", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{
			"status": "healthy",
			"app":    config.AppName(),
		})
	})

	// Setup routes
	setupRoutes(app)

	// Graceful shutdown
	go func() {
		sigChan := make(chan os.Signal, 1)
		signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
		<-sigChan

		log.Println("Shutting down server...")
		if err := app.Shutdown(); err != nil {
			log.Printf("Server shutdown error: %v", err)
		}
	}()

	// Start server
	port := config.Port()
	log.Printf("🚀 Server starting on port %s", port)
	if err := app.Listen(":" + port); err != nil {
		log.Fatalf("Server error: %v", err)
	}

	// Cleanup
	database.Close()
	cache.Close()
}

func setupRoutes(app *fiber.App) {
	// API routes
	api := app.Group("/api")

	// Go link: open app or store on mobile (avoid web). QR can point to /go/driver/:id
	app.Get("/go/driver/:id", handlers.DriverGo)

	// Driver auth (public, no auth) - dedicated group so GET and POST both match
	driverPublic := api.Group("/driver")
	driverPublic.Get("/health", handlers.DriverHealth)
	driverPublic.Get("/qr/:id", handlers.DriverQR)
	driverPublic.Post("/send-otp", handlers.DriverSendOTP)
	driverPublic.Post("/verify-otp", handlers.DriverVerifyOTP)

	// Auth routes (public)
	authRoutes := api.Group("/auth")
	authRoutes.Post("/login", handlers.Login)
	authRoutes.Post("/logout", handlers.Logout)
	authRoutes.Post("/send-otp", handlers.SendOTP)
	authRoutes.Post("/verify-otp", handlers.VerifyOTP)

	// Public driver list (used during registration / pre-auth screens)
	api.Get("/drivers/public", handlers.GetDriversPublic)
	api.Post("/register/student/send-otp", handlers.SendRegisterStudentOTP)
	api.Post("/register/student/verify-otp", handlers.VerifyRegisterStudentOTP)
	api.Get("/register/student/email-available", handlers.RegisterStudentEmailAvailable)
	// Public multipart upload for registration documents (same handler as admin upload; no auth)
	api.Post("/register/student/upload", handlers.UploadFile)
	api.Post("/register/student", handlers.PublicRegisterStudent)
	api.Get("/register/student/status", handlers.GetRegisterStudentStatus)

	// Protected routes
	protected := api.Group("", middleware.RequireAuth())

	// Me endpoint
	protected.Get("/me", handlers.Me)

	// Driver routes (authenticated drivers only)
	driver := protected.Group("/driver", middleware.RequireRole("Driver"))
	driver.Get("/ride-bills", handlers.GetDriverRideBills)

	// User preferences
	protected.Get("/preferences", handlers.GetPreferences)
	protected.Put("/preferences", handlers.UpdatePreferences)

	// Sessions
	protected.Get("/sessions", handlers.GetSessions)
	protected.Get("/login-history", handlers.GetLoginHistory)
	protected.Delete("/sessions/:id", handlers.RevokeSession)
	protected.Delete("/sessions", handlers.RevokeAllSessions)

	// Student accessible routes (read-only for ride locations and own ride bills)
	protected.Get("/ride-locations", handlers.GetRideLocations)
	protected.Get("/ride-locations/:id", handlers.GetRideLocationByID)
	protected.Get("/my-ride-bills", handlers.GetMyRideBills)
	protected.Post("/ride-bills", handlers.CreateRideBill)         // Students can book rides
	protected.Put("/my-ride-bills/:id", handlers.UpdateMyRideBill) // Students can update their own ride bills (mark as completed)
	protected.Get("/drivers", handlers.GetDrivers)                 // All authenticated users can see drivers (full info)

	// Schedule (students can manage their own schedule)
	protected.Get("/schedules", handlers.GetSchedules)
	protected.Get("/schedules/:id", handlers.GetScheduleByID)
	protected.Post("/schedules", handlers.CreateSchedule)
	protected.Put("/schedules/:id", handlers.UpdateSchedule)
	protected.Delete("/schedules/:id", handlers.DeleteSchedule)

	// File viewing (all authenticated users can view files)
	protected.Get("/files/:category/:filename", handlers.GetFile)

	// Admin routes
	admin := api.Group("", middleware.RequireRole("Admin", "SuperAdmin"))

	// User management (admin only)
	admin.Get("/users", handlers.GetUsers)
	admin.Get("/users/:id", handlers.GetUserByID)
	admin.Post("/users", handlers.CreateUser)
	admin.Put("/users/:id", handlers.UpdateUser)
	admin.Delete("/users/:id", handlers.DeleteUser)
	admin.Get("/registrations/students", handlers.GetStudentRegistrationRequests)
	admin.Put("/registrations/students/:id/review", handlers.ReviewStudentRegistration)

	// Ride locations (admin only)
	admin.Get("/ride-locations", handlers.GetRideLocations)
	admin.Get("/ride-locations/:id", handlers.GetRideLocationByID)
	admin.Post("/ride-locations", handlers.CreateRideLocation)
	admin.Put("/ride-locations/:id", handlers.UpdateRideLocation)
	admin.Delete("/ride-locations/:id", handlers.DeleteRideLocation)

	// Ride bills (admin only)
	admin.Get("/ride-bills", handlers.GetRideBills)
	admin.Get("/ride-bills/stats", handlers.GetRideBillStatistics)
	admin.Get("/ride-bills/:id", handlers.GetRideBillByID)
	admin.Put("/ride-bills/:id", handlers.UpdateRideBill)
	admin.Delete("/ride-bills/:id", handlers.DeleteRideBill)

	// File uploads (admin only)
	admin.Post("/upload", handlers.UploadFile)
	admin.Delete("/files/:category/:filename", handlers.DeleteFile)

	// Static file serving for uploads
	app.Static("/uploads", "./uploads")

	// Handle favicon and ads.txt requests (common automated requests)
	app.Get("/favicon.ico", func(c *fiber.Ctx) error {
		return c.SendStatus(204) // No Content
	})
	app.Get("/favicon.ico/*", func(c *fiber.Ctx) error {
		return c.SendStatus(204) // No Content
	})
}

func customErrorHandler(c *fiber.Ctx, err error) error {
	code := fiber.StatusInternalServerError
	message := "Internal Server Error"

	if e, ok := err.(*fiber.Error); ok {
		code = e.Code
		message = e.Message
	}

	log.Printf("[Error] %d - %s: %v", code, c.Path(), err)

	return c.Status(code).JSON(fiber.Map{
		"error": message,
	})
}

func normalizeAllowedOrigins(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" || raw == "*" {
		return raw
	}

	parts := strings.Split(raw, ",")
	normalized := make([]string, 0, len(parts))
	for _, part := range parts {
		origin := strings.TrimSpace(part)
		if origin != "" {
			normalized = append(normalized, origin)
		}
	}
	return strings.Join(normalized, ",")
}
