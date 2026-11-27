package com.commissiontracker.security;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Duration;
import org.junit.jupiter.api.Test;

class RateLimiterTest {
    private final Duration minute = Duration.ofMinutes(1);

    @Test
    void blocksAfterTheLimitAndResetsWhenTheWindowPasses() {
        RateLimiter limiter = new RateLimiter(true);
        long t = 1_000_000;
        assertTrue(limiter.allow("k", 3, minute, t));
        assertTrue(limiter.allow("k", 3, minute, t + 1));
        assertTrue(limiter.allow("k", 3, minute, t + 2));
        assertFalse(limiter.allow("k", 3, minute, t + 3));
        assertTrue(limiter.allow("other", 3, minute, t + 3)); // keys are independent
        assertTrue(limiter.allow("k", 3, minute, t + 60_001)); // new window
    }

    @Test
    void disabledLimiterAllowsEverything() {
        RateLimiter limiter = new RateLimiter(false);
        for (int i = 0; i < 100; i++) assertTrue(limiter.allow("k", 1, minute));
    }
}