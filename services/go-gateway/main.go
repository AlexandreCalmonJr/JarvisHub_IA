// JARVIS AI Hub — Serviço Go (Edge Gateway de Alta Concorrência + Crawler)
// Inspirado nos utilitários concorrentes do ecossistema OpenClaw/OpenBot para VPS e servidores domésticos.
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"
)

type rateBucket struct {
	tokens float64
	last   time.Time
}

type ipLimiter struct {
	mu      sync.Mutex
	rps     float64
	burst   float64
	buckets map[string]*rateBucket
}

func newIPLimiter(rps float64) *ipLimiter {
	if rps < 5 {
		rps = 40
	}
	return &ipLimiter{
		rps:     rps,
		burst:   rps * 2,
		buckets: make(map[string]*rateBucket),
	}
}

func (l *ipLimiter) allow(ip string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now()
	b, ok := l.buckets[ip]
	if !ok {
		l.buckets[ip] = &rateBucket{tokens: l.burst - 1, last: now}
		return true
	}
	elapsed := now.Sub(b.last).Seconds()
	b.tokens += elapsed * l.rps
	if b.tokens > l.burst {
		b.tokens = l.burst
	}
	b.last = now
	if b.tokens < 1 {
		return false
	}
	b.tokens--
	return true
}

func isPublicHTTPTarget(raw string) (*url.URL, error) {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil {
		return nil, fmt.Errorf("URL inválida")
	}
	if u.Scheme != "https" {
		return nil, fmt.Errorf("crawler permite apenas URLs públicas HTTPS")
	}
	host := strings.ToLower(u.Hostname())
	if host == "" || host == "localhost" || strings.HasSuffix(host, ".local") || host == "metadata.google.internal" {
		return nil, fmt.Errorf("host privado ou reservado bloqueado")
	}
	ips, err := net.LookupIP(host)
	if err != nil {
		return nil, fmt.Errorf("falha ao resolver DNS do alvo")
	}
	for _, ip := range ips {
		if ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() || ip.IsUnspecified() {
			return nil, fmt.Errorf("endereço IP interno bloqueado")
		}
	}
	return u, nil
}

type crawlRequest struct {
	URLs []string `json:"urls"`
}

type crawlItem struct {
	URL        string `json:"url"`
	StatusCode int    `json:"status_code"`
	Bytes      int    `json:"bytes"`
	DurationMs int64  `json:"duration_ms"`
	Error      string `json:"error,omitempty"`
}

func main() {
	port := os.Getenv("GATEWAY_PORT")
	if port == "" {
		port = "8080"
	}
	upstreamRaw := os.Getenv("UPSTREAM_BRAIN_URL")
	if upstreamRaw == "" {
		upstreamRaw = "http://jarvis-brain-api:3000"
	}
	upstream, err := url.Parse(upstreamRaw)
	if err != nil {
		log.Fatalf("UPSTREAM_BRAIN_URL inválida: %v", err)
	}

	rps := 40.0
	if rawRps := os.Getenv("RATE_LIMIT_RPS"); rawRps != "" {
		if parsed, parseErr := strconv.ParseFloat(rawRps, 64); parseErr == nil && parsed >= 5 {
			rps = parsed
		}
	}

	startedAt := time.Now()
	limiter := newIPLimiter(rps)
	proxy := httputil.NewSingleHostReverseProxy(upstream)
	internalToken := strings.TrimSpace(os.Getenv("INTERNAL_GATEWAY_TOKEN"))

	mux := http.NewServeMux()

	mux.HandleFunc("/gateway/health", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"status":         "online",
			"service":        "jarvis-go-gateway",
			"upstream":       upstream.String(),
			"uptime_seconds": int(time.Since(startedAt).Seconds()),
		})
	})

	// Crawler concorrente com goroutines (máx. 8 URLs por lote, apenas HTTPS público)
	mux.HandleFunc("/gateway/crawl", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
			return
		}
		if internalToken != "" && r.Header.Get("X-Gateway-Token") != internalToken {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
		var req crawlRequest
		if err := json.NewDecoder(io.LimitReader(r.Body, 64*1024)).Decode(&req); err != nil {
			http.Error(w, "JSON inválido", http.StatusBadRequest)
			return
		}
		if len(req.URLs) > 8 {
			req.URLs = req.URLs[:8]
		}

		client := &http.Client{Timeout: 6 * time.Second}
		results := make([]crawlItem, len(req.URLs))
		var wg sync.WaitGroup
		for idx, rawURL := range req.URLs {
			wg.Add(1)
			go func(i int, target string) {
				defer wg.Done()
				t0 := time.Now()
				parsed, vErr := isPublicHTTPTarget(target)
				if vErr != nil {
					results[i] = crawlItem{URL: target, Error: vErr.Error(), DurationMs: time.Since(t0).Milliseconds()}
					return
				}
				ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
				defer cancel()
				hReq, _ := http.NewRequestWithContext(ctx, http.MethodGet, parsed.String(), nil)
				hReq.Header.Set("User-Agent", "JARVIS-Go-Crawler/1.0")
				resp, reqErr := client.Do(hReq)
				if reqErr != nil {
					results[i] = crawlItem{URL: target, Error: reqErr.Error(), DurationMs: time.Since(t0).Milliseconds()}
					return
				}
				defer resp.Body.Close()
				body, _ := io.ReadAll(io.LimitReader(resp.Body, 256*1024))
				results[i] = crawlItem{
					URL:        parsed.String(),
					StatusCode: resp.StatusCode,
					Bytes:      len(body),
					DurationMs: time.Since(t0).Milliseconds(),
				}
			}(idx, rawURL)
		}
		wg.Wait()
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"results": results})
	})

	// Proxy reverso para todas as rotas do Cérebro Node.js (/api/v1/*)
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		host, _, _ := net.SplitHostPort(r.RemoteAddr)
		if host == "" {
			host = r.RemoteAddr
		}
		if !limiter.allow(host) {
			http.Error(w, "Rate limit exceeded", http.StatusTooManyRequests)
			return
		}
		proxy.ServeHTTP(w, r)
	})

	srv := &http.Server{
		Addr:              ":" + port,
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
	}
	log.Printf("[JARVIS Go Gateway] ouvindo na porta %s -> %s", port, upstream.String())
	log.Fatal(srv.ListenAndServe())
}
