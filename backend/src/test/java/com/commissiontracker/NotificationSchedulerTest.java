package com.commissiontracker;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.commissiontracker.model.Commission;
import com.commissiontracker.model.Notification;
import com.commissiontracker.model.User;
import com.commissiontracker.repository.CommissionRepository;
import com.commissiontracker.repository.NotificationRepository;
import com.commissiontracker.repository.UserRepository;
import com.commissiontracker.service.NotificationScheduler;
import jakarta.persistence.EntityManager;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest
@Transactional
class NotificationSchedulerTest {
    @Autowired UserRepository users;
    @Autowired CommissionRepository commissions;
    @Autowired NotificationRepository notifications;
    @Autowired NotificationScheduler scheduler;
    @Autowired EntityManager em;

    @Test
    void notifiesOnlyActiveUnnotifiedCommissionsDueWithin24HoursAndOnlyOnce() {
        User u = newUser("notify@example.com");
        Instant now = Instant.now();

        make(u, "due in 2h", now.plus(2, ChronoUnit.HOURS), Commission.Status.PENDING, false);
        make(u, "overdue", now.minus(3, ChronoUnit.HOURS), Commission.Status.IN_PROGRESS, false);
        make(u, "due in 48h", now.plus(48, ChronoUnit.HOURS), Commission.Status.PENDING, false);
        make(u, "completed", now.plus(2, ChronoUnit.HOURS), Commission.Status.COMPLETED, false);
        make(u, "already notified", now.plus(2, ChronoUnit.HOURS), Commission.Status.PENDING, true);
        make(u, "no deadline", null, Commission.Status.PENDING, false);
        em.flush();

        scheduler.scan(now);
        scheduler.scan(now); // a second run must not notify again
        em.flush();
        em.clear();

        // scoped to this test's user: the dev database may hold other users' rows
        List<String> titles = notifications.findUnread(u.getId()).stream()
                .map(n -> n.getCommission().getTitle()).sorted().toList();
        assertEquals(List.of("due in 2h", "overdue"), titles);
    }

    @Test
    void anEditedDeadlineIsNotifiedAgain() {
        User u = newUser("edit@example.com");
        Instant now = Instant.now();
        Commission c = make(u, "moves", now.plus(2, ChronoUnit.HOURS), Commission.Status.PENDING, false);
        em.flush();
        scheduler.scan(now);
        em.flush();
        em.clear();

        // the artist reads the alert, then edits the deadline (what PATCH /deadline does)
        List<Long> ids = notifications.findUnread(u.getId()).stream().map(Notification::getId).toList();
        assertEquals(1, ids.size());
        notifications.markRead(u.getId(), ids, now);
        em.clear();
        notifications.deleteForCommission(c.getId());
        Commission edited = commissions.findById(c.getId()).orElseThrow();
        edited.setNotified(false);
        edited.setDeadline(now.plus(5, ChronoUnit.HOURS));
        em.flush();

        scheduler.scan(now);
        em.flush();
        em.clear();
        assertEquals(1, notifications.findUnread(u.getId()).size());
    }

    private User newUser(String email) {
        User u = new User();
        u.setEmail(email);
        u.setPasswordHash("x");
        return users.save(u);
    }

    private Commission make(User u, String title, Instant deadline, Commission.Status status, boolean notified) {
        Commission c = new Commission();
        c.setUser(u);
        c.setTitle(title);
        c.setPlatform(Commission.Platform.OTHER);
        c.setDeadline(deadline);
        c.setStatus(status);
        c.setNotified(notified);
        return commissions.save(c);
    }

    @Test
    void scanUserOnlyNotifiesThatUser() {
        User a = newUser("scan-a@example.com");
        User b = newUser("scan-b@example.com");
        Instant now = Instant.now();
        make(a, "A due", now.plus(2, ChronoUnit.HOURS), Commission.Status.PENDING, false);
        make(b, "B due", now.plus(2, ChronoUnit.HOURS), Commission.Status.PENDING, false);
        em.flush();

        scheduler.scanUser(a.getId(), now);
        em.flush();
        em.clear();

        assertEquals(1, notifications.findUnread(a.getId()).size());
        assertEquals(0, notifications.findUnread(b.getId()).size());
    }
}