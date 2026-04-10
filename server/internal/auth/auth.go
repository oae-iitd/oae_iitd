package auth

import (
	"context"
	"errors"
	"log"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"golang.org/x/crypto/bcrypt"

	"github.com/server/internal/cache"
	"github.com/server/internal/database"
)

var (
	ErrInvalidCredentials = errors.New("invalid credentials")
	ErrUserNotFound       = errors.New("user not found")
	ErrAccountInactive    = errors.New("account inactive")
)

// User represents a user in the system
type User struct {
	ID           int       `json:"id"`
	Username     *string   `json:"username,omitempty"`
	Name         *string   `json:"name,omitempty"`
	Email        *string   `json:"email,omitempty"`
	PasswordHash *string   `json:"-"`
	Role         string    `json:"role"`
	Phone        *string   `json:"phone,omitempty"`
	Status       *string   `json:"status,omitempty"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// Session represents a user session
type Session struct {
	UserID   int    `json:"user_id"`
	Username string `json:"username"`
	Name     string `json:"name"`
	Email    string `json:"email"`
	Role     string `json:"role"`
	Client   string `json:"client"`
}

// GetUserByUsernameOrEmail retrieves a user by username or email
func GetUserByUsernameOrEmail(ctx context.Context, identifier string) (*User, error) {
	query := `
		SELECT id, COALESCE(username, '') AS username, COALESCE(name, '') AS name, COALESCE(email, '') AS email, password_hash, role, phone, COALESCE(status, 'active') AS status, created_at, updated_at
		FROM users
		WHERE username = $1 OR email = $1
		LIMIT 1
	`

	var user User
	err := database.GetPool().QueryRow(ctx, query, identifier).Scan(
		&user.ID,
		&user.Username,
		&user.Name,
		&user.Email,
		&user.PasswordHash,
		&user.Role,
		&user.Phone,
		&user.Status,
		&user.CreatedAt,
		&user.UpdatedAt,
	)

	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, ErrUserNotFound
		}
		return nil, err
	}

	return &user, nil
}

// GetUserByPhoneAndRole retrieves a user by phone number and role (e.g. "Driver" or "driver")
// Phone matches exactly or by digits-only (so +919876543210 matches 919876543210 or 9876543210 in DB).
func GetUserByPhoneAndRole(ctx context.Context, phone, role string) (*User, error) {
	var digitsOnly strings.Builder
	for _, r := range phone {
		if r >= '0' && r <= '9' {
			digitsOnly.WriteRune(r)
		}
	}
	digStr := digitsOnly.String()
	if digStr == "" {
		digStr = phone
	}
	query := `
		SELECT id, COALESCE(username, '') AS username, COALESCE(email, '') AS email, password_hash, role, phone, created_at, updated_at
		FROM users
		WHERE LOWER(role) = LOWER($1)
		  AND (
		    phone = $2
		    OR REPLACE(REPLACE(TRIM(COALESCE(phone,'')), '+', ''), ' ', '') = $3
		    OR REPLACE(REPLACE(TRIM(COALESCE(phone,'')), '+', ''), ' ', '') = RIGHT($3::text, 10)
		  )
		ORDER BY id
		LIMIT 1
	`

	var user User
	err := database.GetPool().QueryRow(ctx, query, role, phone, digStr).Scan(
		&user.ID,
		&user.Username,
		&user.Email,
		&user.PasswordHash,
		&user.Role,
		&user.Phone,
		&user.CreatedAt,
		&user.UpdatedAt,
	)

	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, ErrUserNotFound
		}
		return nil, err
	}

	return &user, nil
}

// CreateSessionForUser creates a session for the given user and returns session ID (for driver OTP login)
func CreateSessionForUser(ctx context.Context, user *User, clientType string) (string, error) {
	session := &Session{
		UserID:   user.ID,
		Username: stringOrEmpty(user.Username),
		Name:     stringOrEmpty(user.Name),
		Email:    stringOrEmpty(user.Email),
		Role:     user.Role,
		Client:   normalizeClientType(clientType),
	}
	sessionID := uuid.New().String()
	if err := cache.SetSession(ctx, sessionID, session, 24*time.Hour); err != nil {
		return "", err
	}
	return sessionID, nil
}

// VerifyPassword compares a password with a hash
func VerifyPassword(hashedPassword *string, password string) error {
	if hashedPassword == nil || *hashedPassword == "" {
		return ErrInvalidCredentials
	}
	return bcrypt.CompareHashAndPassword([]byte(*hashedPassword), []byte(password))
}

// Login authenticates a user and creates a session
func Login(ctx context.Context, identifier, password, clientType string) (*Session, string, error) {
	// Get user by username or email
	user, err := GetUserByUsernameOrEmail(ctx, identifier)
	if err != nil {
		if err == ErrUserNotFound {
			log.Printf("[Auth] User not found for identifier: %s", identifier)
			return nil, "", ErrInvalidCredentials
		}
		log.Printf("[Auth] Error getting user: %v", err)
		return nil, "", err
	}

	log.Printf("[Auth] User found: %s (ID: %d), verifying password...", stringOrEmpty(user.Username), user.ID)
	if !strings.EqualFold(stringOrEmpty(user.Status), "active") {
		log.Printf("[Auth] Login blocked for inactive account: %s (ID: %d, status: %s)", stringOrEmpty(user.Username), user.ID, stringOrEmpty(user.Status))
		return nil, "", ErrAccountInactive
	}

	// Verify password
	if err := VerifyPassword(user.PasswordHash, password); err != nil {
		log.Printf("[Auth] Password verification failed for user: %s", stringOrEmpty(user.Username))
		return nil, "", ErrInvalidCredentials
	}

	log.Printf("[Auth] Password verified successfully for user: %s", stringOrEmpty(user.Username))

	// Create session
	session := &Session{
		UserID:   user.ID,
		Username: stringOrEmpty(user.Username),
		Name:     stringOrEmpty(user.Name),
		Email:    stringOrEmpty(user.Email),
		Role:     user.Role,
		Client:   normalizeClientType(clientType),
	}

	sessionID := uuid.New().String()
	if err := cache.SetSession(ctx, sessionID, session, 24*time.Hour); err != nil {
		return nil, "", err
	}

	return session, sessionID, nil
}

func normalizeClientType(clientType string) string {
	switch strings.ToLower(strings.TrimSpace(clientType)) {
	case "mobile-app", "driver-mobile":
		return "mobile-app"
	default:
		return "web-admin"
	}
}

func IsRoleAllowedForClient(role, clientType string) bool {
	r := strings.ToLower(strings.TrimSpace(role))
	c := normalizeClientType(clientType)

	if c == "web-admin" {
		return r == "admin" || r == "superadmin"
	}
	return r == "student" || r == "driver"
}

// GetSession retrieves a session from Redis
func GetSession(ctx context.Context, sessionID string) (*Session, error) {
	var session Session
	if err := cache.GetSession(ctx, sessionID, &session); err != nil {
		return nil, err
	}
	return &session, nil
}

// Logout removes a session from Redis
func Logout(ctx context.Context, sessionID string) error {
	return cache.DeleteSession(ctx, sessionID)
}

// HashPassword creates a bcrypt hash from a password
func HashPassword(password string) (string, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}
	return string(hash), nil
}

func stringOrEmpty(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}
