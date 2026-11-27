package com.commissiontracker.repository;

import com.commissiontracker.model.Notification;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

public interface NotificationRepository extends JpaRepository<Notification, Long> {

    @Query("select n from Notification n join fetch n.commission where n.user.id = :userId and n.readAt is null order by n.createdAt")
    List<Notification> findUnread(@Param("userId") Long userId);

    // scoped by user: ids belonging to someone else are silently ignored
    @Transactional
    @Modifying
    @Query("update Notification n set n.readAt = :now where n.user.id = :userId and n.readAt is null and n.id in :ids")
    int markRead(@Param("userId") Long userId, @Param("ids") Collection<Long> ids, @Param("now") Instant now);

    @Transactional
    @Modifying
    @Query("delete from Notification n where n.commission.id = :commissionId")
    void deleteForCommission(@Param("commissionId") Long commissionId);
}