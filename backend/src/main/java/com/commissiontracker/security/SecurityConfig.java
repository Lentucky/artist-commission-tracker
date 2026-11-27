package com.commissiontracker.security;

import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

@Configuration
public class SecurityConfig {

    @Bean
    SecurityFilterChain filterChain(HttpSecurity http, JwtTokenProvider tokens) throws Exception {
        return http
                .cors(Customizer.withDefaults()) // uses the corsConfigurationSource bean below
                .csrf(csrf -> csrf.disable()) // stateless bearer tokens, no cookies
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(a -> a
                        .requestMatchers("/api/auth/**", "/error").permitAll()
                        .anyRequest().authenticated())
                // 401 in the same JSON shape as every other error, so clients can tell "token expired" apart
                .exceptionHandling(e -> e.authenticationEntryPoint((req, res, ex) -> {
                    res.setStatus(401);
                    res.setCharacterEncoding("UTF-8");
                    res.setContentType("application/json");
                    res.getWriter().write("{\"status\":401,\"message\":\"Not authenticated\",\"fields\":{}}");
                }))
                .addFilterBefore(new JwtAuthenticationFilter(tokens), UsernamePasswordAuthenticationFilter.class)
                .build();
    }

    /** Browsers may call the API only from the origins in APP_CORS_ALLOWED_ORIGINS (comma-separated). The extension is exempt: it uses host permissions. */
    @Bean
    CorsConfigurationSource corsConfigurationSource(@Value("${app.cors.allowed-origins:}") List<String> origins) {
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/**", corsFor(origins));
        return source;
    }

    static CorsConfiguration corsFor(List<String> origins) {
        CorsConfiguration config = new CorsConfiguration();
        // nothing configured means no website may call the API from a browser
        config.setAllowedOrigins(origins.stream().map(String::trim).filter(o -> !o.isEmpty()).toList());
        config.setAllowedMethods(List.of("GET", "POST", "PATCH", "OPTIONS"));
        config.setAllowedHeaders(List.of("Authorization", "Content-Type"));
        config.setMaxAge(3600L);
        return config;
    }

    @Bean
    PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    // JWT-only app: defining this stops Spring creating a default user with a generated password
    @Bean
    UserDetailsService noUsers() {
        return username -> { throw new UsernameNotFoundException(username); };
    }
}