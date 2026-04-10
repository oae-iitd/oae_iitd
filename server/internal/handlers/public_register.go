package handlers

import (
	"context"
	"log"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"

	"github.com/server/internal/auth"
	"github.com/server/internal/cache"
	"github.com/server/internal/database"
	"github.com/server/internal/email"
	"github.com/server/internal/middleware"
)

type StudentPublicRegisterRequest struct {
	Email                 string  `json:"email"`
	Username              string  `json:"username"`
	Password              string  `json:"password"`
	Name                  string  `json:"name"`
	Phone                 string  `json:"phone"`
	EnrollmentNumber      string  `json:"enrollmentNumber"`
	Programme             string  `json:"programme"`
	Course                string  `json:"course"`
	Year                  string  `json:"year"`
	Hostel                string  `json:"hostel"`
	ProfilePicture        string  `json:"profilePicture"`
	DisabilityType        string  `json:"disabilityType"`
	DisabilityPercentage  float64 `json:"disabilityPercentage"`
	UDIDNumber            string  `json:"udidNumber"`
	DisabilityCertificate string  `json:"disabilityCertificate"`
	IDProofType           string  `json:"idProofType"`
	IDProofDocument       string  `json:"idProofDocument"`
}

type RegistrationReviewRequest struct {
	ApprovalStatus string  `json:"approvalStatus"`
	ApprovalReason *string `json:"approvalReason"`
	ExpiryDate     *string `json:"expiryDate"` // YYYY-MM-DD; required when approvalStatus is approved
}

// PublicRegisterStudent allows student self-registration without admin auth.
func PublicRegisterStudent(c *fiber.Ctx) error {
	ctx, cancel := database.DefaultTimeout()
	defer cancel()

	var req StudentPublicRegisterRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{
			"error": "invalid request body",
		})
	}

	req.Email = strings.TrimSpace(strings.ToLower(req.Email))
	req.Username = strings.TrimSpace(req.Username)
	req.Name = strings.TrimSpace(req.Name)
	req.Phone = strings.TrimSpace(req.Phone)
	req.EnrollmentNumber = strings.TrimSpace(req.EnrollmentNumber)
	req.Programme = strings.TrimSpace(req.Programme)
	req.Course = strings.TrimSpace(req.Course)
	req.Year = strings.TrimSpace(req.Year)
	req.Hostel = strings.TrimSpace(req.Hostel)
	req.DisabilityType = strings.TrimSpace(req.DisabilityType)
	req.UDIDNumber = strings.TrimSpace(req.UDIDNumber)
	if req.Email == "" || req.Username == "" || req.Password == "" {
		return c.Status(400).JSON(fiber.Map{
			"error": "email, username, and password are required",
		})
	}
	if req.Name == "" || req.Phone == "" {
		return c.Status(400).JSON(fiber.Map{
			"error": "name and phone are required",
		})
	}
	if req.EnrollmentNumber == "" || req.Programme == "" || req.Course == "" || req.Year == "" || req.Hostel == "" {
		return c.Status(400).JSON(fiber.Map{
			"error": "enrollmentNumber, programme, course, year, and hostel are required",
		})
	}
	if req.DisabilityType == "" || req.UDIDNumber == "" || strings.TrimSpace(req.IDProofType) == "" {
		return c.Status(400).JSON(fiber.Map{
			"error": "disabilityType, udidNumber, and idProofType are required",
		})
	}

	normalizedIDProof, ok := normalizeIDProofTypeInput(req.IDProofType)
	if !ok || (normalizedIDProof != "aadhaar" && normalizedIDProof != "pan" && normalizedIDProof != "voter") {
		return c.Status(400).JSON(fiber.Map{
			"error": "invalid id proof type. Must be one of: aadhaar, pan, voter",
		})
	}
	req.IDProofType = normalizedIDProof

	hash, err := auth.HashPassword(req.Password)
	if err != nil {
		log.Printf("[PublicRegisterStudent] Password hash error: %v", err)
		return c.Status(500).JSON(fiber.Map{
			"error": "failed to process password",
		})
	}

	query := `
		INSERT INTO users (
			username, email, password_hash, role, phone, name, status,
			enrollment_number, programme, course, year, hostel,
			profile_picture, disability_type, disability_percentage, udid_number,
			disability_certificate, id_proof_type, id_proof_document,
			approval_status, approval_reason
		) VALUES (
			$1, $2, $3, 'Student', $4, $5, 'inactive',
			$6, $7, $8, $9, $10,
			$11, $12, $13, $14,
			$15, $16, $17,
			'pending', NULL
		) RETURNING id
	`
	hasReviewCols, colsErr := hasStudentReviewColumns(ctx)
	if colsErr != nil {
		log.Printf("[PublicRegisterStudent] Column check error: %v", colsErr)
	}
	if !hasReviewCols {
		query = `
			INSERT INTO users (
				username, email, password_hash, role, phone, name, status,
				enrollment_number, programme, course, year, hostel,
				profile_picture, disability_type, disability_percentage, udid_number,
				disability_certificate, id_proof_type, id_proof_document
			) VALUES (
				$1, $2, $3, 'Student', $4, $5, 'inactive',
				$6, $7, $8, $9, $10,
				$11, $12, $13, $14,
				$15, $16, $17
			) RETURNING id
		`
	}

	var userID int
	err = database.GetPool().QueryRow(ctx, query,
		req.Username, req.Email, hash, req.Phone, req.Name,
		req.EnrollmentNumber, req.Programme, req.Course, req.Year, req.Hostel,
		nullIfEmpty(req.ProfilePicture), req.DisabilityType, req.DisabilityPercentage, req.UDIDNumber,
		nullIfEmpty(req.DisabilityCertificate), req.IDProofType, nullIfEmpty(req.IDProofDocument),
	).Scan(&userID)
	if err != nil {
		log.Printf("[PublicRegisterStudent] Insert error: %v", err)
		errMsg := strings.ToLower(err.Error())
		if strings.Contains(errMsg, "duplicate key") || strings.Contains(errMsg, "unique constraint") {
			if strings.Contains(errMsg, "username") {
				return c.Status(409).JSON(fiber.Map{"error": "username already exists"})
			}
			if strings.Contains(errMsg, "email") {
				return c.Status(409).JSON(fiber.Map{"error": "email already exists"})
			}
			return c.Status(409).JSON(fiber.Map{"error": "username or email already exists"})
		}
		return c.Status(500).JSON(fiber.Map{
			"error": "failed to register student",
		})
	}

	requestID := middleware.GetRequestID(c)
	return c.Status(201).JSON(fiber.Map{
		"message":    "student registered successfully",
		"user_id":    userID,
		"request_id": requestID,
	})
}

// RegisterStudentEmailAvailable reports whether an email can be used for new registration (DB is source of truth).
func RegisterStudentEmailAvailable(c *fiber.Ctx) error {
	ctx, cancel := database.DefaultTimeout()
	defer cancel()

	emailAddr := strings.TrimSpace(strings.ToLower(c.Query("email")))
	if emailAddr == "" {
		return c.Status(400).JSON(fiber.Map{"error": "email is required"})
	}

	var exists bool
	err := database.GetPool().QueryRow(ctx, `
		SELECT EXISTS (SELECT 1 FROM users WHERE LOWER(email) = LOWER($1))
	`, emailAddr).Scan(&exists)
	if err != nil {
		log.Printf("[RegisterStudentEmailAvailable] Query error: %v", err)
		return c.Status(500).JSON(fiber.Map{"error": "failed to check email"})
	}

	return c.JSON(fiber.Map{
		"available": !exists,
		"email":     emailAddr,
	})
}

// GetRegisterStudentStatus returns approval status for a registration email.
func GetRegisterStudentStatus(c *fiber.Ctx) error {
	ctx, cancel := database.DefaultTimeout()
	defer cancel()

	emailAddr := strings.TrimSpace(strings.ToLower(c.Query("email")))
	if emailAddr == "" {
		return c.Status(400).JSON(fiber.Map{"error": "email is required"})
	}

	var (
		userID         int
		approvalStatus *string
		approvalReason *string
	)
	hasReviewCols, colsErr := hasStudentReviewColumns(ctx)
	if colsErr != nil {
		log.Printf("[GetRegisterStudentStatus] Column check error: %v", colsErr)
	}
	query := `
		SELECT id, approval_status, approval_reason
		FROM users
		WHERE LOWER(role) = 'student' AND LOWER(email) = $1
		ORDER BY id DESC
		LIMIT 1
	`
	if !hasReviewCols {
		query = `
			SELECT id, NULL::TEXT AS approval_status, NULL::TEXT AS approval_reason
			FROM users
			WHERE LOWER(role) = 'student' AND LOWER(email) = $1
			ORDER BY id DESC
			LIMIT 1
		`
	}
	err := database.GetPool().QueryRow(ctx, query, emailAddr).Scan(&userID, &approvalStatus, &approvalReason)
	if err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "registration not found"})
	}

	requestID := middleware.GetRequestID(c)
	return c.JSON(fiber.Map{
		"user_id":        userID,
		"approvalStatus": safeString(approvalStatus, "pending"),
		"approvalReason": safeString(approvalReason, ""),
		"email":          emailAddr,
		"request_id":     requestID,
	})
}

// GetStudentRegistrationRequests returns pending/processed student self-registrations for admin.
func GetStudentRegistrationRequests(c *fiber.Ctx) error {
	ctx, cancel := database.DefaultTimeout()
	defer cancel()

	hasReviewCols, colsErr := hasStudentReviewColumns(ctx)
	if colsErr != nil {
		log.Printf("[GetStudentRegistrationRequests] Column check error: %v", colsErr)
	}
	query := `
		SELECT id, COALESCE(email, ''), COALESCE(name, ''), COALESCE(phone, ''),
		       COALESCE(enrollment_number, ''), COALESCE(programme, ''), COALESCE(course, ''), COALESCE(year, ''),
		       COALESCE(approval_status, 'pending'), COALESCE(approval_reason, ''), created_at
		FROM users
		WHERE LOWER(role) = 'student'
		ORDER BY created_at DESC
	`
	if !hasReviewCols {
		query = `
			SELECT id, COALESCE(email, ''), COALESCE(name, ''), COALESCE(phone, ''),
			       COALESCE(enrollment_number, ''), COALESCE(programme, ''), COALESCE(course, ''), COALESCE(year, ''),
			       'pending' AS approval_status, '' AS approval_reason, created_at
			FROM users
			WHERE LOWER(role) = 'student'
			ORDER BY created_at DESC
		`
	}
	rows, err := database.GetPool().Query(ctx, query)
	if err != nil {
		log.Printf("[GetStudentRegistrationRequests] Query error: %v", err)
		return c.Status(500).JSON(fiber.Map{"error": "failed to fetch registration requests"})
	}
	defer rows.Close()

	var requests []fiber.Map
	for rows.Next() {
		var (
			id             int
			emailAddr      string
			name           string
			phone          string
			enrollment     string
			programme      string
			course         string
			year           string
			approvalStatus string
			approvalReason string
			createdAt      time.Time
		)
		if scanErr := rows.Scan(&id, &emailAddr, &name, &phone, &enrollment, &programme, &course, &year, &approvalStatus, &approvalReason, &createdAt); scanErr != nil {
			log.Printf("[GetStudentRegistrationRequests] Scan error: %v", scanErr)
			continue
		}
		requests = append(requests, fiber.Map{
			"id":               id,
			"email":            emailAddr,
			"name":             name,
			"phone":            phone,
			"enrollmentNumber": enrollment,
			"programme":        programme,
			"course":           course,
			"year":             year,
			"approvalStatus":   approvalStatus,
			"approvalReason":   approvalReason,
			"createdAt":        createdAt.Format(time.RFC3339),
		})
	}
	if err := rows.Err(); err != nil {
		log.Printf("[GetStudentRegistrationRequests] Rows error: %v", err)
		return c.Status(500).JSON(fiber.Map{"error": "failed to fetch registration requests"})
	}
	return c.JSON(requests)
}

// ReviewStudentRegistration lets admin approve/reject student self-registration.
func ReviewStudentRegistration(c *fiber.Ctx) error {
	ctx, cancel := database.DefaultTimeout()
	defer cancel()

	id := strings.TrimSpace(c.Params("id"))
	if id == "" {
		return c.Status(400).JSON(fiber.Map{"error": "id is required"})
	}

	var req RegistrationReviewRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid request body"})
	}
	status := strings.ToLower(strings.TrimSpace(req.ApprovalStatus))
	if status != "approved" && status != "rejected" {
		return c.Status(400).JSON(fiber.Map{"error": "approvalStatus must be approved or rejected"})
	}
	if status == "rejected" && (req.ApprovalReason == nil || strings.TrimSpace(*req.ApprovalReason) == "") {
		return c.Status(400).JSON(fiber.Map{"error": "approvalReason is required when rejected"})
	}

	var expiryDate *time.Time
	if status == "approved" {
		if req.ExpiryDate == nil || strings.TrimSpace(*req.ExpiryDate) == "" {
			return c.Status(400).JSON(fiber.Map{"error": "expiryDate is required when approving (YYYY-MM-DD)"})
		}
		t, err := time.Parse("2006-01-02", strings.TrimSpace(*req.ExpiryDate))
		if err != nil {
			return c.Status(400).JSON(fiber.Map{"error": "invalid expiryDate. Use YYYY-MM-DD"})
		}
		expiryDate = &t
	}

	var reason *string
	if req.ApprovalReason != nil {
		trimmed := strings.TrimSpace(*req.ApprovalReason)
		if trimmed != "" {
			reason = &trimmed
		}
	}
	hasReviewCols, colsErr := hasStudentReviewColumns(ctx)
	if colsErr != nil {
		log.Printf("[ReviewStudentRegistration] Column check error: %v", colsErr)
	}
	if !hasReviewCols {
		return c.Status(500).JSON(fiber.Map{"error": "registration review columns missing. run database migration 022"})
	}

	// On approve: set expiry_date; on reject: leave expiry_date unchanged (pass NULL for COALESCE).
	var expiryArg interface{}
	if expiryDate != nil {
		expiryArg = expiryDate.Format("2006-01-02")
	}

	_, err := database.GetPool().Exec(ctx, `
		UPDATE users
		SET approval_status = $1::text,
		    approval_reason = $2,
		    status = CASE WHEN $1::text = 'approved' THEN 'active' ELSE 'inactive' END,
		    expiry_date = COALESCE($4::date, expiry_date),
		    updated_at = NOW()
		WHERE id = $3 AND LOWER(role) = 'student'
	`, status, reason, id, expiryArg)
	if err != nil {
		log.Printf("[ReviewStudentRegistration] Update error: %v", err)
		return c.Status(500).JSON(fiber.Map{"error": "failed to update registration review"})
	}

	requestID := middleware.GetRequestID(c)
	return c.JSON(fiber.Map{
		"message":    "registration review updated",
		"request_id": requestID,
	})
}

func nullIfEmpty(value string) *string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func safeString(value *string, defaultValue string) string {
	if value == nil {
		return defaultValue
	}
	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		return defaultValue
	}
	return trimmed
}

type RegisterStudentOTPRequest struct {
	Email string `json:"email"`
}

type VerifyRegisterStudentOTPRequest struct {
	Email string `json:"email"`
	OTP   string `json:"otp"`
}

// SendRegisterStudentOTP sends OTP for new student registration email verification.
func SendRegisterStudentOTP(c *fiber.Ctx) error {
	ctx, cancel := database.DefaultTimeout()
	defer cancel()

	var req RegisterStudentOTPRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid request body"})
	}
	emailAddr := strings.TrimSpace(strings.ToLower(req.Email))
	if emailAddr == "" {
		return c.Status(400).JSON(fiber.Map{"error": "email is required"})
	}

	otp := cache.GenerateOTP()
	if err := cache.SetOTP(ctx, emailAddr, otp); err != nil {
		log.Printf("[SendRegisterStudentOTP] Error storing OTP in Redis: %v", err)
		return c.Status(500).JSON(fiber.Map{"error": "failed to generate OTP"})
	}
	if err := database.StoreOTP(ctx, emailAddr, otp, nil, "student_registration"); err != nil {
		log.Printf("[SendRegisterStudentOTP] Warning: failed to store OTP in DB: %v", err)
	}

	// Send OTP email
	if err := email.SendOTPEmail(ctx, emailAddr, otp, nil); err != nil {
		log.Printf("[SendRegisterStudentOTP] Warning: failed to send OTP email to %s: %v", emailAddr, err)
		log.Printf("[SendRegisterStudentOTP] OTP for %s: %s (email failed)", emailAddr, otp)

		if !email.IsSMTPConfigured() {
			return c.Status(500).JSON(fiber.Map{
				"error": "Email service not configured. Please configure SMTP settings.",
				"hint":  "Required: SMTP_HOST, SMTP_USERNAME, SMTP_PASSWORD. Optional: SMTP_PORT, SMTP_FROM_EMAIL, SMTP_FROM_NAME",
			})
		}

		return c.Status(500).JSON(fiber.Map{
			"error": "failed to send OTP email",
			"hint":  email.GetSMTPInfo(),
		})
	}

	requestID := middleware.GetRequestID(c)
	return c.JSON(fiber.Map{
		"message":    "OTP sent successfully",
		"request_id": requestID,
	})
}

// VerifyRegisterStudentOTP verifies OTP for new student registration.
func VerifyRegisterStudentOTP(c *fiber.Ctx) error {
	ctx, cancel := database.DefaultTimeout()
	defer cancel()

	var req VerifyRegisterStudentOTPRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid request body"})
	}
	email := strings.TrimSpace(strings.ToLower(req.Email))
	otp := strings.TrimSpace(req.OTP)
	if email == "" || otp == "" {
		return c.Status(400).JSON(fiber.Map{"error": "email and otp are required"})
	}

	valid, err := cache.VerifyOTP(ctx, email, otp)
	if err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "redis: nil") {
			return c.Status(400).JSON(fiber.Map{"error": "invalid or expired OTP"})
		}
		log.Printf("[VerifyRegisterStudentOTP] Redis verify error: %v", err)
		return c.Status(500).JSON(fiber.Map{"error": "failed to verify OTP"})
	}
	if !valid {
		return c.Status(400).JSON(fiber.Map{"error": "invalid OTP"})
	}
	if _, dbErr := database.VerifyOTPFromDB(ctx, email, otp); dbErr != nil {
		log.Printf("[VerifyRegisterStudentOTP] Warning: DB verify failed: %v", dbErr)
	}
	_ = cache.DeleteOTP(ctx, email)

	requestID := middleware.GetRequestID(c)
	return c.JSON(fiber.Map{
		"valid":      true,
		"message":    "OTP verified successfully",
		"request_id": requestID,
	})
}

func hasStudentReviewColumns(ctx context.Context) (bool, error) {
	var count int
	err := database.GetPool().QueryRow(ctx, `
		SELECT COUNT(*)
		FROM information_schema.columns
		WHERE table_name = 'users'
		  AND column_name IN ('approval_status', 'approval_reason')
	`).Scan(&count)
	if err != nil {
		return false, err
	}
	return count == 2, nil
}
