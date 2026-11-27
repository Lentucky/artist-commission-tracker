package com.commissiontracker.controller;

import com.commissiontracker.model.Commission;
import com.commissiontracker.repository.CommissionRepository;
import com.commissiontracker.repository.UserRepository;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import com.commissiontracker.repository.NotificationRepository;
import org.springframework.transaction.annotation.Transactional;

@RestController
@RequestMapping("/api/commissions")
public class CommissionController {

    record CommissionRequest(
            @NotBlank @Size(max = 255) String title,
            @Size(max = 255) String clientName,
            @NotNull Commission.Platform platform,
            // http(s) only: the dashboard renders this as a link, so no javascript: URLs
            @Size(max = 2048) @Pattern(regexp = "^https?://.+") String sourceUrl,
            @DecimalMin("0.00") @Digits(integer = 10, fraction = 2) BigDecimal budget,
            Instant deadline,
            Map<String, Object> metadata) {}

    record CommissionResponse(Long id, String title, String clientName, Commission.Platform platform,
                              String sourceUrl, BigDecimal budget, Instant deadline,
                              Commission.Status status, Map<String, Object> metadata, Instant createdAt) {
        static CommissionResponse from(Commission c) {
            return new CommissionResponse(c.getId(), c.getTitle(), c.getClientName(), c.getPlatform(),
                    c.getSourceUrl(), c.getBudget(), c.getDeadline(), c.getStatus(),
                    c.getMetadata(), c.getCreatedAt());
        }
    }

    record StatusRequest(@NotNull Commission.Status status) {}
    record DeadlineRequest(Instant deadline) {} // null removes the deadline

    private final CommissionRepository commissions;
    private final UserRepository users;
    private final NotificationRepository notifications;

    public CommissionController(CommissionRepository commissions, UserRepository users, NotificationRepository notifications) {
        this.commissions = commissions;
        this.users = users;
        this.notifications = notifications;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    CommissionResponse create(@AuthenticationPrincipal Long userId, @Valid @RequestBody CommissionRequest r) {
        if (r.sourceUrl() != null && commissions.existsByUserIdAndSourceUrl(userId, r.sourceUrl())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Already tracked");
        }
        Commission c = new Commission();
        c.setUser(users.getReferenceById(userId));
        c.setTitle(r.title());
        c.setClientName(r.clientName());
        c.setPlatform(r.platform());
        c.setSourceUrl(r.sourceUrl());
        if (r.budget() != null) c.setBudget(r.budget()); // null keeps the entity default of 0
        c.setDeadline(r.deadline());
        if (r.metadata() != null) c.setMetadata(r.metadata());
        return CommissionResponse.from(commissions.save(c));
    }

    @GetMapping
    List<CommissionResponse> list(@AuthenticationPrincipal Long userId,
                                  @RequestParam(defaultValue = "deadline") String sort,
                                  @RequestParam(required = false) Commission.Status status) {
        List<Commission> all = switch (sort) {
            case "deadline" -> commissions.findByUserIdOrderByDeadlineAsc(userId);
            case "budget" -> commissions.findByUserIdOrderByBudgetDesc(userId);
            default -> throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "sort must be deadline or budget");
        };
        // shortcut: filters in memory, fine for one artist's list; move to a repository query if lists reach thousands
        return all.stream()
                .filter(c -> status == null || c.getStatus() == status)
                .map(CommissionResponse::from)
                .toList();
    }

    @PatchMapping("/{id}/status")
    CommissionResponse setStatus(@AuthenticationPrincipal Long userId, @PathVariable Long id,
                                 @Valid @RequestBody StatusRequest r) {
        // looked up by id AND owner: someone else's commission is a 404, never a 403 that confirms it exists
        Commission c = commissions.findByIdAndUserId(id, userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        c.setStatus(r.status());
        return CommissionResponse.from(commissions.save(c));
    }

    @PatchMapping("/{id}/deadline")
    @Transactional
    CommissionResponse setDeadline(@AuthenticationPrincipal Long userId, @PathVariable Long id,
                                   @RequestBody DeadlineRequest r) {
        Commission c = commissions.findByIdAndUserId(id, userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        c.setDeadline(r.deadline());
        // a new deadline earns a fresh alert: drop the old notification and let the scheduler consider it again
        notifications.deleteForCommission(id);
        c.setNotified(false);
        return CommissionResponse.from(commissions.save(c));
    }
}