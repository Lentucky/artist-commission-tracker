package com.commissiontracker.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;

import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;

class SecurityConfigCorsTest {
    @Test
    void onlyConfiguredOriginsAreAllowed() {
        var config = SecurityConfig.corsFor(List.of("https://dash.example.com"));
        assertEquals("https://dash.example.com", config.checkOrigin("https://dash.example.com"));
        assertNull(config.checkOrigin("https://evil.example.com"));
        assertNull(config.checkOrigin("https://dash.example.com.evil.com"));
    }

    @Test
    void noConfiguredOriginsMeansNoCrossOriginAccess() {
        var config = SecurityConfig.corsFor(List.of(" ", ""));
        assertNull(config.checkOrigin("https://dash.example.com"));
    }

    @Test
    void patchIsAllowedButDeleteIsNot() {
        var config = SecurityConfig.corsFor(List.of("https://dash.example.com"));
        assertNotNull(config.checkHttpMethod(HttpMethod.PATCH));
        assertNull(config.checkHttpMethod(HttpMethod.DELETE));
    }
}