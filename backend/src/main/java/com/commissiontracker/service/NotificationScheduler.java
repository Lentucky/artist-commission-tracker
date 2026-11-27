package com.commissiontracker.service;

import com.commissiontracker.model.Commission;
import com.commissiontracker.model.Notification;
import com.commissiontracker.repository.CommissionRepository;
import com.commissiontracker.repository.NotificationRepository;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class NotificationScheduler {
    private static final List<Commission.Status> ACTIVE = List.of(Commission.Status.PENDING, Commission.Status.IN_PROGRESS);

    private final CommissionRepository commissions;
    private final NotificationRepository notifications;

    public NotificationScheduler(CommissionRepository commissions, NotificationRepository notifications) {
        this.commissions = commissions;
        this.notifications = notifications;
    }

    /** Top of every minute. Set app.notifications.scan-cron=- to turn it off (hosts that sleep rely on polling instead). */
    @Scheduled(cron = "${app.notifications.scan-cron:0 * * * * *}")
    @Transactional
    public void scheduledScan() {
        scan(Instant.now());
    }

    /** One notification per active commission due within 24h (or already overdue) that hasn't been notified. */
    @Transactional
    public int scan(Instant now) {
        return notifyAll(commissions.findByNotifiedFalseAndStatusInAndDeadlineLessThanEqual(ACTIVE, windowEnd(now)));
    }

    /** Same rule for one user; runs when their extension polls, so alerts don't depend on a cron that may be asleep. */
    @Transactional
    public int scanUser(Long userId, Instant now) {
        return notifyAll(commissions.findByUserIdAndNotifiedFalseAndStatusInAndDeadlineLessThanEqual(userId, ACTIVE, windowEnd(now)));
    }

    private static Instant windowEnd(Instant now) {
        return now.plus(24, ChronoUnit.HOURS);
    }

    private int notifyAll(List<Commission> due) {
        for (Commission c : due) {
            Notification n = new Notification();
            n.setUser(c.getUser());
            n.setCommission(c);
            notifications.save(n);
            c.setNotified(true); // managed entity: flushed on commit, so a commission is never notified twice
        }
        return due.size();
    }
}