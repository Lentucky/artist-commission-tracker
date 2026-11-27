package com.commissiontracker.repository;

import com.commissiontracker.model.Commission;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CommissionRepository extends JpaRepository<Commission, Long> {
    List<Commission> findByUserIdOrderByDeadlineAsc(Long userId);
    List<Commission> findByUserIdOrderByBudgetDesc(Long userId);
    boolean existsByUserIdAndSourceUrl(Long userId, String sourceUrl);
    Optional<Commission> findByIdAndUserId(Long id, Long userId);

    // active, not yet notified, deadline before `until` (overdue ones included; no deadline never matches)
    List<Commission> findByNotifiedFalseAndStatusInAndDeadlineLessThanEqual(Collection<Commission.Status> statuses, Instant until);

    // same rule as the global query, for one user (used when their extension polls)
    List<Commission> findByUserIdAndNotifiedFalseAndStatusInAndDeadlineLessThanEqual(Long userId, Collection<Commission.Status> statuses, Instant until);
}