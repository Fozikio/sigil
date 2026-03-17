package server

// Sigil — Agent control surface extensions for ntfy
// These endpoints add agent-aware features to the stock ntfy pub/sub server:
// - /sigil/status: aggregate service health, active sessions, pending approvals
// - /sigil/gesture: receive human gesture responses (approve/reject/retry)
// - /sigil/command: dispatch commands to agents (start, stop, health check)
// - /sigil/webhook: receive agent heartbeats
// - Webhook-on-publish: POST full message JSON to configured URL on every publish
//
// These features are framework-agnostic. Any agent that can POST to ntfy can use
// Sigil for human-in-the-loop control. No dependency on cortex, fozikio, or any
// specific agent framework.

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"heckel.io/ntfy/v2/log"
	"heckel.io/ntfy/v2/model"
)

// SigilState holds in-memory state for the agent control surface
type SigilState struct {
	mu               sync.RWMutex
	sessions         map[string]*AgentSession
	services         []ServiceHealth
	pendingApprovals []*PendingApproval
	commands         []CommandButton
}

// AgentSession tracks a running agent session via heartbeats
type AgentSession struct {
	SessionID     string `json:"session_id"`
	Project       string `json:"project"`
	Status        string `json:"status"` // active, idle, blocked, completing, stale
	LastHeartbeat int64  `json:"last_heartbeat"`
	ToolCalls     int    `json:"tool_calls"`
	Model         string `json:"model,omitempty"`
	StartedAt     int64  `json:"started_at"`
}

// ServiceHealth tracks an external service's health
type ServiceHealth struct {
	Name       string `json:"name"`
	Status     string `json:"status"` // ok, degraded, down, unknown
	ResponseMs int64  `json:"response_ms,omitempty"`
	LastCheck  string `json:"last_check,omitempty"`
	Error      string `json:"error,omitempty"`
}

// PendingApproval is a notification awaiting human gesture response
type PendingApproval struct {
	MessageID string    `json:"message_id"`
	Topic     string    `json:"topic"`
	Title     string    `json:"title"`
	Message   string    `json:"message"`
	Actions   []string  `json:"actions"`
	Timeout   string    `json:"timeout,omitempty"`
	Fallback  string    `json:"fallback,omitempty"`
	CreatedAt time.Time `json:"created_at"`
}

// CommandButton defines an available command in the dashboard
type CommandButton struct {
	Label   string `json:"label"`
	Command string `json:"command"`
	Project string `json:"project,omitempty"`
	Icon    string `json:"icon,omitempty"`
	Confirm bool   `json:"confirm,omitempty"`
}

// GestureRequest is the body of POST /sigil/gesture
type GestureRequest struct {
	Action    string `json:"action"`    // approve, reject, retry, detail, etc.
	MessageID string `json:"message_id"`
	Responder string `json:"responder,omitempty"` // dashboard, phone, etc.
}

// CommandRequest is the body of POST /sigil/command
type CommandRequest struct {
	Command string `json:"command"` // start, health, pause_all, etc.
	Project string `json:"project,omitempty"`
}

// HeartbeatRequest is the body of POST /sigil/webhook
type HeartbeatRequest struct {
	Type      string `json:"type"` // heartbeat, notification, status
	SessionID string `json:"session_id,omitempty"`
	Project   string `json:"project,omitempty"`
	Status    string `json:"status,omitempty"`
	ToolCalls int    `json:"tool_calls,omitempty"`
	Model     string `json:"model,omitempty"`
	Message   string `json:"message,omitempty"`
	Title     string `json:"title,omitempty"`
	Priority  string `json:"priority,omitempty"`
}

// SigilStatusResponse is the response from GET /sigil/status
type SigilStatusResponse struct {
	Sessions         []*AgentSession  `json:"sessions"`
	Services         []ServiceHealth  `json:"services"`
	PendingApprovals []*PendingApproval `json:"pending_approvals"`
	Commands         []CommandButton  `json:"commands"`
}

// NewSigilState creates a new SigilState with default commands
func NewSigilState() *SigilState {
	return &SigilState{
		sessions:         make(map[string]*AgentSession),
		services:         []ServiceHealth{},
		pendingApprovals: []*PendingApproval{},
		commands: []CommandButton{
			{Label: "Start PACO", Command: "start", Project: "paco", Icon: "🚀"},
			{Label: "Health Check", Command: "health", Icon: "💊"},
			{Label: "Pause All", Command: "pause_all", Icon: "✋", Confirm: true},
		},
	}
}

// handleSigilStatus returns current agent control surface state
func (s *Server) handleSigilStatus(w http.ResponseWriter, r *http.Request, v *visitor) error {
	s.sigil.mu.RLock()
	defer s.sigil.mu.RUnlock()

	sessions := make([]*AgentSession, 0, len(s.sigil.sessions))
	for _, sess := range s.sigil.sessions {
		sessions = append(sessions, sess)
	}

	resp := SigilStatusResponse{
		Sessions:         sessions,
		Services:         s.sigil.services,
		PendingApprovals: s.sigil.pendingApprovals,
		Commands:         s.sigil.commands,
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", s.config.AccessControlAllowOrigin)
	return json.NewEncoder(w).Encode(resp)
}

// handleSigilGesture processes a human gesture response
func (s *Server) handleSigilGesture(w http.ResponseWriter, r *http.Request, v *visitor) error {
	body, err := io.ReadAll(io.LimitReader(r.Body, 4096))
	if err != nil {
		return err
	}
	defer r.Body.Close()

	var req GestureRequest
	if err := json.Unmarshal(body, &req); err != nil {
		return errHTTPBadRequestInvalidJSON
	}
	if req.Action == "" || req.MessageID == "" {
		return errHTTPBadRequestInvalidJSON
	}

	// Publish gesture response to a response topic
	// Convention: agents subscribe to "{topic}-responses" for gesture feedback
	responseTopic := fmt.Sprintf("sigil-gestures")
	responseMsg := fmt.Sprintf(`{"action":"%s","message_id":"%s","responder":"%s","timestamp":"%s"}`,
		req.Action, req.MessageID, req.Responder, time.Now().UTC().Format(time.RFC3339))

	// Publish internally via the standard publish mechanism
	t, err := s.topicFromPath(fmt.Sprintf("/%s", responseTopic))
	if err == nil {
		msg := &model.Message{
			ID:      util.RandomString(12),
			Time:    time.Now().Unix(),
			Expires: time.Now().Add(24 * time.Hour).Unix(),
			Event:   model.MessageEvent,
			Topic:   responseTopic,
			Message: responseMsg,
		}
		if pubErr := t.Publish(v, msg); pubErr != nil {
			log.Tag("sigil").Warn("Failed to publish gesture response: %s", pubErr)
		}
		if s.messageCache != nil {
			s.messageCache.AddMessage(msg)
		}
	}

	// Remove from pending approvals
	s.sigil.mu.Lock()
	for i, pa := range s.sigil.pendingApprovals {
		if pa.MessageID == req.MessageID {
			s.sigil.pendingApprovals = append(s.sigil.pendingApprovals[:i], s.sigil.pendingApprovals[i+1:]...)
			break
		}
	}
	s.sigil.mu.Unlock()

	// Call webhook if configured (for cortex integration, etc.)
	if s.config.SigilWebhookURL != "" {
		go s.sigilWebhookPost(s.config.SigilWebhookURL, body)
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", s.config.AccessControlAllowOrigin)
	fmt.Fprintf(w, `{"ok":true,"action":"%s","message_id":"%s"}`+"\n", req.Action, req.MessageID)
	return nil
}

// handleSigilCommand dispatches a command from the dashboard
func (s *Server) handleSigilCommand(w http.ResponseWriter, r *http.Request, v *visitor) error {
	body, err := io.ReadAll(io.LimitReader(r.Body, 4096))
	if err != nil {
		return err
	}
	defer r.Body.Close()

	var req CommandRequest
	if err := json.Unmarshal(body, &req); err != nil {
		return errHTTPBadRequestInvalidJSON
	}
	if req.Command == "" {
		return errHTTPBadRequestInvalidJSON
	}

	// Publish command to sigil-commands topic
	commandTopic := "sigil-commands"
	commandMsg := fmt.Sprintf(`{"command":"%s","project":"%s","timestamp":"%s"}`,
		req.Command, req.Project, time.Now().UTC().Format(time.RFC3339))

	t, err := s.topicFromPath(fmt.Sprintf("/%s", commandTopic))
	if err == nil {
		msg := &model.Message{
			ID:      util.RandomString(12),
			Time:    time.Now().Unix(),
			Expires: time.Now().Add(24 * time.Hour).Unix(),
			Event:   model.MessageEvent,
			Topic:   commandTopic,
			Message: commandMsg,
		}
		if pubErr := t.Publish(v, msg); pubErr != nil {
			log.Tag("sigil").Warn("Failed to publish command: %s", pubErr)
		}
		if s.messageCache != nil {
			s.messageCache.AddMessage(msg)
		}
	}

	// Call webhook if configured
	if s.config.SigilWebhookURL != "" {
		go s.sigilWebhookPost(s.config.SigilWebhookURL, body)
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", s.config.AccessControlAllowOrigin)
	fmt.Fprintf(w, `{"ok":true,"command":"%s","project":"%s"}`+"\n", req.Command, req.Project)
	return nil
}

// handleSigilWebhook receives agent heartbeats and notifications
func (s *Server) handleSigilWebhook(w http.ResponseWriter, r *http.Request, v *visitor) error {
	body, err := io.ReadAll(io.LimitReader(r.Body, 16384))
	if err != nil {
		return err
	}
	defer r.Body.Close()

	var req HeartbeatRequest
	if err := json.Unmarshal(body, &req); err != nil {
		return errHTTPBadRequestInvalidJSON
	}

	switch req.Type {
	case "heartbeat":
		s.sigil.mu.Lock()
		if req.SessionID != "" {
			sess, exists := s.sigil.sessions[req.SessionID]
			if !exists {
				sess = &AgentSession{
					SessionID: req.SessionID,
					Project:   req.Project,
					StartedAt: time.Now().Unix(),
				}
				s.sigil.sessions[req.SessionID] = sess
			}
			sess.LastHeartbeat = time.Now().Unix()
			sess.Status = req.Status
			if sess.Status == "" {
				sess.Status = "active"
			}
			sess.ToolCalls = req.ToolCalls
			sess.Model = req.Model
		}
		s.sigil.mu.Unlock()

	case "notification":
		// Publish to the agent's notification topic
		topic := "sigil-notifications"
		if req.Project != "" {
			topic = fmt.Sprintf("sigil-%s", req.Project)
		}
		t, err := s.topicFromPath(fmt.Sprintf("/%s", topic))
		if err == nil {
			msg := &model.Message{
				ID:      util.RandomString(12),
				Time:    time.Now().Unix(),
				Expires: time.Now().Add(24 * time.Hour).Unix(),
				Event:   model.MessageEvent,
				Topic:   topic,
				Title:   req.Title,
				Message: req.Message,
			}
			if pubErr := t.Publish(v, msg); pubErr != nil {
				log.Tag("sigil").Warn("Failed to publish notification: %s", pubErr)
			}
			if s.messageCache != nil {
				s.messageCache.AddMessage(msg)
			}
		}

	case "end":
		s.sigil.mu.Lock()
		delete(s.sigil.sessions, req.SessionID)
		s.sigil.mu.Unlock()
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", s.config.AccessControlAllowOrigin)
	fmt.Fprintln(w, `{"ok":true}`)
	return nil
}

// webhookOnPublish sends the full message JSON to configured webhook URL
func (s *Server) webhookOnPublish(v *visitor, m *model.Message) {
	if s.config.WebhookOnPublishURL == "" {
		return
	}
	payload, err := json.Marshal(m)
	if err != nil {
		log.Tag("sigil").Warn("Failed to marshal message for webhook: %s", err)
		return
	}
	req, err := http.NewRequest("POST", s.config.WebhookOnPublishURL, strings.NewReader(string(payload)))
	if err != nil {
		log.Tag("sigil").Warn("Failed to create webhook request: %s", err)
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "sigil/"+s.config.BuildVersion)
	if s.config.WebhookOnPublishSecret != "" {
		req.Header.Set("Authorization", "Bearer "+s.config.WebhookOnPublishSecret)
	}
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		log.Tag("sigil").Warn("Webhook delivery failed: %s", err)
		return
	}
	resp.Body.Close()
	if resp.StatusCode >= 400 {
		log.Tag("sigil").Warn("Webhook returned %d", resp.StatusCode)
	}
}

// sigilWebhookPost sends arbitrary JSON to the sigil webhook URL
func (s *Server) sigilWebhookPost(url string, body []byte) {
	req, err := http.NewRequest("POST", url, strings.NewReader(string(body)))
	if err != nil {
		return
	}
	req.Header.Set("Content-Type", "application/json")
	if s.config.SigilWebhookSecret != "" {
		req.Header.Set("Authorization", "Bearer "+s.config.SigilWebhookSecret)
	}
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		log.Tag("sigil").Warn("Sigil webhook POST failed: %s", err)
		return
	}
	resp.Body.Close()
}

// runSigilSessionReaper periodically marks stale sessions
func (s *Server) runSigilSessionReaper() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			s.sigil.mu.Lock()
			now := time.Now().Unix()
			for id, sess := range s.sigil.sessions {
				if now-sess.LastHeartbeat > 300 { // 5 minutes stale threshold
					sess.Status = "stale"
				}
				if now-sess.LastHeartbeat > 3600 { // 1 hour = dead, remove
					delete(s.sigil.sessions, id)
				}
			}
			s.sigil.mu.Unlock()
		case <-s.closeChan:
			return
		}
	}
}
