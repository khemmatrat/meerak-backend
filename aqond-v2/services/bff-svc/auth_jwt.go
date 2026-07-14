package main

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"os"
	"strings"
	"time"
)

type jwtClaims struct {
	Iss string `json:"iss"`
	Sub string `json:"sub"`
	Sid string `json:"sid"`
	Amr string `json:"amr"`
	Exp int64  `json:"exp"`
}

func jwtSecret() string {
	if s := strings.TrimSpace(os.Getenv("KONG_JWT_SECRET")); s != "" {
		return s
	}
	if s := strings.TrimSpace(os.Getenv("MEERAK_JWT_SECRET")); s != "" {
		return s
	}
	return "dev-kong-jwt-secret-change-me"
}

func mintSessionJWT(userID, sessionID, authMethod string, ttl time.Duration) string {
	claims := jwtClaims{
		Iss: "aqond-jwt-issuer",
		Sub: userID,
		Sid: sessionID,
		Amr: authMethod,
		Exp: time.Now().Add(ttl).Unix(),
	}
	payload, _ := json.Marshal(claims)
	header := base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"HS256","typ":"JWT"}`))
	body := base64.RawURLEncoding.EncodeToString(payload)
	sigInput := header + "." + body
	mac := hmac.New(sha256.New, []byte(jwtSecret()))
	mac.Write([]byte(sigInput))
	sig := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	return sigInput + "." + sig
}

func parseJWTClaims(token string) (jwtClaims, bool) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return jwtClaims{}, false
	}
	raw, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return jwtClaims{}, false
	}
	var c jwtClaims
	if json.Unmarshal(raw, &c) != nil || c.Sub == "" {
		return jwtClaims{}, false
	}
	return c, true
}

func verifyJWT(token string) bool {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return false
	}
	sigInput := parts[0] + "." + parts[1]
	mac := hmac.New(sha256.New, []byte(jwtSecret()))
	mac.Write([]byte(sigInput))
	expected := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	return hmac.Equal([]byte(expected), []byte(parts[2]))
}

func isJWT(token string) bool {
	return strings.Count(token, ".") == 2
}
