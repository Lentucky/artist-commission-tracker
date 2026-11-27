package com.commissiontracker;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.commissiontracker.model.Commission;
import com.commissiontracker.model.User;
import com.commissiontracker.repository.CommissionRepository;
import com.commissiontracker.repository.UserRepository;
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest
@Transactional
class CommissionRepositoryTest {
    @Autowired UserRepository users;
    @Autowired CommissionRepository commissions;
    @Autowired EntityManager em;

    @Test
    void sortsAndRoundTripsJson() {
        User u = new User();
        u.setEmail("test@example.com");
        u.setPasswordHash("x");
        users.save(u);

        Commission soonCheap = make(u, "soonCheap", "50", 1);
        Commission lateRich = make(u, "lateRich", "200", 5);
        commissions.saveAll(List.of(soonCheap, lateRich));
        em.flush();
        em.clear(); // force real reads from the DB

        assertEquals("soonCheap", commissions.findByUserIdOrderByDeadlineAsc(u.getId()).get(0).getTitle());
        assertEquals("lateRich", commissions.findByUserIdOrderByBudgetDesc(u.getId()).get(0).getTitle());
        assertEquals("blue", commissions.findById(soonCheap.getId()).get().getMetadata().get("color"));
    }

    private Commission make(User u, String title, String budget, int daysOut) {
        Commission c = new Commission();
        c.setUser(u);
        c.setTitle(title);
        c.setPlatform(Commission.Platform.VGEN);
        c.setBudget(new BigDecimal(budget));
        c.setDeadline(Instant.now().plus(daysOut, ChronoUnit.DAYS));
        c.setMetadata(Map.of("color", "blue"));
        return c;
    }
}