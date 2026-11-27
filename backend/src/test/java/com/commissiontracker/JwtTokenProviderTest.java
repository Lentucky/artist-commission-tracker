package com.commissiontracker;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.commissiontracker.security.JwtTokenProvider;
import java.util.Optional;
import org.junit.jupiter.api.Test;

class JwtTokenProviderTest {
    private static final String SECRET = "test-secret-test-secret-test-secret-123";

    @Test
    void acceptsOwnTokensAndRejectsBadOnes() {
        JwtTokenProvider p = new JwtTokenProvider(SECRET, 60_000);
        assertEquals(Optional.of(42L), p.validate(p.generate(42L)));

        // header + payload of user 43 with the signature of user 42
        String[] a = p.generate(42L).split("\\.");
        String[] b = p.generate(43L).split("\\.");
        assertTrue(p.validate(a[0] + "." + b[1] + "." + a[2]).isEmpty());

        JwtTokenProvider expired = new JwtTokenProvider(SECRET, -1000);
        assertTrue(expired.validate(expired.generate(42L)).isEmpty());

        JwtTokenProvider otherKey = new JwtTokenProvider("another-secret-another-secret-12345", 60_000);
        assertTrue(p.validate(otherKey.generate(42L)).isEmpty());

        assertTrue(p.validate("garbage").isEmpty());
    }
}