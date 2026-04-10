package database

import (
	"context"
	"time"
)

type UserPreferences struct {
	ID                  int       `json:"id"`
	UserID              int       `json:"userId"`
	AccentColor         string    `json:"accentColor"`
	Theme               string    `json:"theme"`
	NotifEmail          bool      `json:"notifEmail"`
	NotifRideUpdates    bool      `json:"notifRideUpdates"`
	NotifSecurityAlerts bool      `json:"notifSecurityAlerts"`
	CreatedAt           time.Time `json:"createdAt"`
	UpdatedAt           time.Time `json:"updatedAt"`
}

func hasNotificationPreferenceColumns(ctx context.Context) bool {
	const query = `
		SELECT COUNT(*)
		FROM information_schema.columns
		WHERE table_name = 'user_preferences'
		  AND column_name IN ('notif_email', 'notif_ride_updates', 'notif_security_alerts')
	`

	var count int
	if err := GetPool().QueryRow(ctx, query).Scan(&count); err != nil {
		return false
	}
	return count == 3
}

func GetUserPreferences(ctx context.Context, userID int) (*UserPreferences, error) {
	var prefs UserPreferences
	var err error

	if hasNotificationPreferenceColumns(ctx) {
		query := `
			SELECT id, user_id, accent_color, theme,
			       notif_email, notif_ride_updates, notif_security_alerts,
			       created_at, updated_at
			FROM user_preferences
			WHERE user_id = $1
		`
		err = GetPool().QueryRow(ctx, query, userID).Scan(
			&prefs.ID, &prefs.UserID, &prefs.AccentColor, &prefs.Theme,
			&prefs.NotifEmail, &prefs.NotifRideUpdates, &prefs.NotifSecurityAlerts,
			&prefs.CreatedAt, &prefs.UpdatedAt,
		)
	} else {
		query := `
			SELECT id, user_id, accent_color, theme, created_at, updated_at
			FROM user_preferences
			WHERE user_id = $1
		`
		err = GetPool().QueryRow(ctx, query, userID).Scan(
			&prefs.ID, &prefs.UserID, &prefs.AccentColor, &prefs.Theme,
			&prefs.CreatedAt, &prefs.UpdatedAt,
		)
		prefs.NotifEmail = true
		prefs.NotifRideUpdates = true
		prefs.NotifSecurityAlerts = true
	}
	if err != nil {
		return CreateDefaultPreferences(ctx, userID)
	}

	return &prefs, nil
}

func CreateDefaultPreferences(ctx context.Context, userID int) (*UserPreferences, error) {
	var prefs UserPreferences
	var err error

	if hasNotificationPreferenceColumns(ctx) {
		query := `
			INSERT INTO user_preferences
				(user_id, accent_color, theme, notif_email, notif_ride_updates, notif_security_alerts)
			VALUES ($1, 'blue', 'system', TRUE, TRUE, TRUE)
			ON CONFLICT (user_id) DO UPDATE
			SET accent_color = EXCLUDED.accent_color,
			    theme        = EXCLUDED.theme
			RETURNING id, user_id, accent_color, theme,
			          notif_email, notif_ride_updates, notif_security_alerts,
			          created_at, updated_at
		`
		err = GetPool().QueryRow(ctx, query, userID).Scan(
			&prefs.ID, &prefs.UserID, &prefs.AccentColor, &prefs.Theme,
			&prefs.NotifEmail, &prefs.NotifRideUpdates, &prefs.NotifSecurityAlerts,
			&prefs.CreatedAt, &prefs.UpdatedAt,
		)
	} else {
		query := `
			INSERT INTO user_preferences (user_id, accent_color, theme)
			VALUES ($1, 'blue', 'system')
			ON CONFLICT (user_id) DO UPDATE
			SET accent_color = EXCLUDED.accent_color,
			    theme        = EXCLUDED.theme
			RETURNING id, user_id, accent_color, theme, created_at, updated_at
		`
		err = GetPool().QueryRow(ctx, query, userID).Scan(
			&prefs.ID, &prefs.UserID, &prefs.AccentColor, &prefs.Theme,
			&prefs.CreatedAt, &prefs.UpdatedAt,
		)
		prefs.NotifEmail = true
		prefs.NotifRideUpdates = true
		prefs.NotifSecurityAlerts = true
	}
	if err != nil {
		return nil, err
	}

	return &prefs, nil
}

func UpdateUserPreferences(ctx context.Context, userID int, accentColor, theme string,
	notifEmail, notifRideUpdates, notifSecurityAlerts bool,
) error {
	var err error
	if hasNotificationPreferenceColumns(ctx) {
		query := `
			INSERT INTO user_preferences
				(user_id, accent_color, theme, notif_email, notif_ride_updates, notif_security_alerts)
			VALUES ($1, $2, $3, $4, $5, $6)
			ON CONFLICT (user_id) DO UPDATE
			SET accent_color           = EXCLUDED.accent_color,
			    theme                  = EXCLUDED.theme,
			    notif_email            = EXCLUDED.notif_email,
			    notif_ride_updates     = EXCLUDED.notif_ride_updates,
			    notif_security_alerts  = EXCLUDED.notif_security_alerts,
			    updated_at             = CURRENT_TIMESTAMP
		`
		_, err = GetPool().Exec(ctx, query, userID, accentColor, theme,
			notifEmail, notifRideUpdates, notifSecurityAlerts)
	} else {
		query := `
			INSERT INTO user_preferences (user_id, accent_color, theme)
			VALUES ($1, $2, $3)
			ON CONFLICT (user_id) DO UPDATE
			SET accent_color = EXCLUDED.accent_color,
			    theme        = EXCLUDED.theme,
			    updated_at   = CURRENT_TIMESTAMP
		`
		_, err = GetPool().Exec(ctx, query, userID, accentColor, theme)
	}
	return err
}

func UpdateAccentColor(ctx context.Context, userID int, accentColor string) error {
	query := `
		INSERT INTO user_preferences (user_id, accent_color)
		VALUES ($1, $2)
		ON CONFLICT (user_id) DO UPDATE
		SET accent_color = EXCLUDED.accent_color,
		    updated_at   = CURRENT_TIMESTAMP
	`

	_, err := GetPool().Exec(ctx, query, userID, accentColor)
	return err
}
