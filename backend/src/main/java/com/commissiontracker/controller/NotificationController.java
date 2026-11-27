package com.commissiontracker.controller;

import com.commissiontracker.repository.NotificationRepository;
import com.commissiontracker.service.NotificationScheduler;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/notifications")
public class NotificationController {
    record NotificationResponse(Long id, Long commissionId, String title, Instant deadline) {}
    record ReadRequest(@NotNull @Size(min = 1, max = 100) List<Long> ids) {}

    private final NotificationRepository notifications;
    private final NotificationScheduler scheduler;

    public NotificationController(NotificationRepository notifications, NotificationScheduler scheduler) {
        this.notifications = notifications;
        this.scheduler = scheduler;
    }

    @GetMapping("/unread")
    List<NotificationResponse> unread(@AuthenticationPrincipal Long userId) {
        try {
            scheduler.scanUser(userId, Instant.now()); // create anything newly due before answering
        } catch (DataIntegrityViolationException e) {
            // two polls raced and the other one created it first: nothing to do
        }
        return notifications.findUnread(userId).stream()
                .map(n -> new NotificationResponse(n.getId(), n.getCommission().getId(),
                        n.getCommission().getTitle(), n.getCommission().getDeadline()))
                .toList();
    }

    @PostMapping("/read")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void read(@AuthenticationPrincipal Long userId, @Valid @RequestBody ReadRequest r) {
        notifications.markRead(userId, r.ids(), Instant.now());
    }
}