package com.commissiontracker.model;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "commissions")
@Getter @Setter
public class Commission {
    public enum Platform { VGEN, TWITTER, DISCORD, OTHER }
    public enum Status { PENDING, IN_PROGRESS, COMPLETED, CANCELLED }

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id")
    private User user;

    @Column(nullable = false)
    private String title;

    @Column(name = "client_name")
    private String clientName;

    @Enumerated(EnumType.STRING) @Column(nullable = false)
    private Platform platform;

    @Column(name = "source_url")
    private String sourceUrl;

    @Column(nullable = false)
    private BigDecimal budget = BigDecimal.ZERO;

    private Instant deadline;

    @Enumerated(EnumType.STRING) @Column(nullable = false)
    private Status status = Status.PENDING;

    private boolean notified;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb", nullable = false)
    private Map<String, Object> metadata = new HashMap<>();

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();
}