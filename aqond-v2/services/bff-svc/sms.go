package main

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

// sendOTPSMS delivers a one-time code via configured SMS provider.
// AQOND_SMS_PROVIDER: thaibulk | twilio | http | log (default log in dev)
func sendOTPSMS(phone, code string) error {
	provider := strings.ToLower(strings.TrimSpace(os.Getenv("AQOND_SMS_PROVIDER")))
	if provider == "" {
		if os.Getenv("AQOND_OTP_DEV_EXPOSE") != "0" {
			provider = "log"
		} else {
			provider = "thaibulk"
		}
	}

	switch provider {
	case "log", "dev":
		log.Printf("sms-otp (dev): phone=%s code=%s", phone, code)
		return nil
	case "twilio":
		return sendTwilioSMS(phone, otpMessage(code))
	case "http":
		return sendHTTPOtpSMS(phone, code)
	case "thaibulk", "thaibulksms":
		return sendThaiBulkSMS(phone, otpMessage(code))
	default:
		return fmt.Errorf("unknown_sms_provider: %s", provider)
	}
}

func otpMessage(code string) string {
	brand := strings.TrimSpace(os.Getenv("AQOND_SMS_SENDER"))
	if brand == "" {
		brand = "AQOND"
	}
	return fmt.Sprintf("%s: รหัส OTP ของคุณคือ %s (หมดอายุใน 5 นาที)", brand, code)
}

func sendThaiBulkSMS(phone, message string) error {
	key := strings.TrimSpace(os.Getenv("THAIBULKSMS_API_KEY"))
	secret := strings.TrimSpace(os.Getenv("THAIBULKSMS_API_SECRET"))
	if key == "" || secret == "" {
		return fmt.Errorf("thaibulksms_credentials_missing")
	}
	sender := strings.TrimSpace(os.Getenv("AQOND_SMS_SENDER"))
	if sender == "" {
		sender = "AQOND"
	}
	msisdn := phone
	if strings.HasPrefix(msisdn, "0") {
		msisdn = "66" + msisdn[1:]
	}
	body, _ := json.Marshal(map[string]string{
		"msisdn":  msisdn,
		"message": message,
		"sender":  sender,
	})
	req, err := http.NewRequest(http.MethodPost, "https://api-v2.thaibulksms.com/sms", bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Basic "+base64.StdEncoding.EncodeToString([]byte(key+":"+secret)))
	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("thaibulksms http %d: %s", resp.StatusCode, string(b))
	}
	return nil
}

func sendTwilioSMS(phone, message string) error {
	sid := strings.TrimSpace(os.Getenv("TWILIO_ACCOUNT_SID"))
	token := strings.TrimSpace(os.Getenv("TWILIO_AUTH_TOKEN"))
	from := strings.TrimSpace(os.Getenv("TWILIO_FROM_NUMBER"))
	if sid == "" || token == "" || from == "" {
		return fmt.Errorf("twilio_credentials_missing")
	}
	to := phone
	if strings.HasPrefix(to, "0") {
		to = "+66" + to[1:]
	} else if !strings.HasPrefix(to, "+") {
		to = "+" + to
	}
	form := url.Values{}
	form.Set("To", to)
	form.Set("From", from)
	form.Set("Body", message)
	req, err := http.NewRequest(http.MethodPost,
		fmt.Sprintf("https://api.twilio.com/2010-04-01/Accounts/%s/Messages.json", sid),
		strings.NewReader(form.Encode()))
	if err != nil {
		return err
	}
	req.SetBasicAuth(sid, token)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("twilio http %d: %s", resp.StatusCode, string(b))
	}
	return nil
}

func sendHTTPOtpSMS(phone, code string) error {
	endpoint := strings.TrimSpace(os.Getenv("AQOND_SMS_HTTP_URL"))
	if endpoint == "" {
		return fmt.Errorf("AQOND_SMS_HTTP_URL required for http provider")
	}
	body, _ := json.Marshal(map[string]string{
		"phone":   phone,
		"code":    code,
		"message": otpMessage(code),
	})
	req, err := http.NewRequest(http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	if h := strings.TrimSpace(os.Getenv("AQOND_SMS_HTTP_AUTH")); h != "" {
		req.Header.Set("Authorization", h)
	}
	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("sms http %d: %s", resp.StatusCode, string(b))
	}
	return nil
}
