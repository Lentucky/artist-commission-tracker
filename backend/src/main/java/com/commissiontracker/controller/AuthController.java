package com.commissiontracker.controller;

import com.commissiontracker.model.User;
import com.commissiontracker.repository.UserRepository;
import com.commissiontracker.security.JwtTokenProvider;
import com.commissiontracker.security.RateLimiter;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Duration;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
    // max 72: BCrypt ignores/rejects anything longer
    record Credentials(@NotBlank @Email String email, @NotBlank @Size(min = 8, max = 72) String password) {}
    record TokenResponse(String token) {}

    private final UserRepository users;
    private final PasswordEncoder encoder;
    private final JwtTokenProvider tokens;
    private final RateLimiter limiter;

    public AuthController(UserRepository users, PasswordEncoder encoder, JwtTokenProvider tokens, RateLimiter limiter) {
        this.users = users;
        this.encoder = encoder;
        this.tokens = tokens;
        this.limiter = limiter;
    }

    @PostMapping("/register")
    TokenResponse register(@Valid @RequestBody Credentials c, HttpServletRequest request) {
        throttle(limiter.allow("register:" + request.getRemoteAddr(), 30, Duration.ofHours(1)));
        String email = c.email().toLowerCase();
        if (users.existsByEmail(email)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Email already registered");
        }
        User u = new User();
        u.setEmail(email);
        u.setPasswordHash(encoder.encode(c.password()));
        return new TokenResponse(tokens.generate(users.save(u).getId()));
    }

    @PostMapping("/login")
    TokenResponse login(@Valid @RequestBody Credentials c) {
        String email = c.email().toLowerCase();
        throttle(limiter.allow("login:" + email, 10, Duration.ofMinutes(15)));
        User u = users.findByEmail(email)
                .filter(x -> encoder.matches(c.password(), x.getPasswordHash()))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid credentials"));
        return new TokenResponse(tokens.generate(u.getId()));
    }

    private static void throttle(boolean allowed) {
        if (!allowed) throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Too many attempts. Try again later.");
    }
}