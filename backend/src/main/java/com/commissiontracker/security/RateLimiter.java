package com.commissiontracker.security;

import java.time.Duration;
import java.util.HashMap;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** In-memory fixed-window limiter: enough for one server instance. Counters reset when the app restarts. */
@Component
public class RateLimiter {
    private static final class Window {
        final long resetAt;
        int count;

        Window(long resetAt) {
            this.resetAt = resetAt;
        }
    }

    private final boolean enabled;
    private final Map<String, Window> windows = new HashMap<>();

    public RateLimiter(@Value("${app.ratelimit.enabled:false}") boolean enabled) {
        this.enabled = enabled;
    }

    /** True while the caller is under `limit` calls for this key in the current window. */
    public synchronized boolean allow(String key, int limit, Duration window) {
        return allow(key, limit, window, System.currentTimeMillis());
    }

    synchronized boolean allow(String key, int limit, Duration window, long now) {
        if (!enabled) return true;
        if (windows.size() > 10_000) { // keep memory bounded under a flood of unique keys
            windows.values().removeIf(w -> w.resetAt <= now);
            if (windows.size() > 10_000) windows.clear();
        }
        Window w = windows.get(key);
        if (w == null || w.resetAt <= now) {
            w = new Window(now + window.toMillis());
            windows.put(key, w);
        }
        return ++w.count <= limit;
    }
}