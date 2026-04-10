package cache

import (
	"context"
	"time"
)

const (
	driverOtpPrefix = "driver_otp:"
	driverOtpTTL    = 5 * time.Minute
)

// SetDriverOTP stores an OTP for a driver phone number
func SetDriverOTP(ctx context.Context, phone, otp string) error {
	key := driverOtpPrefix + phone
	return Set(ctx, key, otp, driverOtpTTL)
}

// GetDriverOTP retrieves OTP for a driver phone number
func GetDriverOTP(ctx context.Context, phone string) (string, error) {
	key := driverOtpPrefix + phone
	return Get(ctx, key)
}

// DeleteDriverOTP removes OTP after successful verification
func DeleteDriverOTP(ctx context.Context, phone string) error {
	key := driverOtpPrefix + phone
	return Delete(ctx, key)
}

// VerifyDriverOTP verifies OTP for a phone number
func VerifyDriverOTP(ctx context.Context, phone, otp string) (bool, error) {
	stored, err := GetDriverOTP(ctx, phone)
	if err != nil {
		return false, err
	}
	return stored == otp, nil
}
