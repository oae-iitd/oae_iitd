package twilio

import (
	"context"

	"github.com/twilio/twilio-go"
	twilioApi "github.com/twilio/twilio-go/rest/api/v2010"

	"github.com/server/internal/config"
)

// SendSMS sends an SMS to the given phone number (E.164) with the given body.
// Uses TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER from config.
func SendSMS(ctx context.Context, to, body string) error {
	accountSid := config.TwilioAccountSID()
	authToken := config.TwilioAuthToken()
	from := config.TwilioPhoneNumber()
	if accountSid == "" || authToken == "" || from == "" {
		return nil // skip send if not configured (e.g. dev)
	}
	client := twilio.NewRestClientWithParams(twilio.ClientParams{
		Username: accountSid,
		Password: authToken,
	})
	params := &twilioApi.CreateMessageParams{}
	params.SetTo(to)
	params.SetFrom(from)
	params.SetBody(body)
	_, err := client.Api.CreateMessage(params)
	return err
}
