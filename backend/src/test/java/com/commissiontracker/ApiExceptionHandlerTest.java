package com.commissiontracker.controller;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.context.request.ServletWebRequest;
import org.springframework.web.server.ResponseStatusException;

class ApiExceptionHandlerTest {
    private final ApiExceptionHandler handler = new ApiExceptionHandler();

    @Test
    void responseStatusExceptionKeepsItsStatusAndReason() throws Exception {
        var request = new ServletWebRequest(new MockHttpServletRequest());
        var res = handler.handleException(new ResponseStatusException(HttpStatus.CONFLICT, "Already tracked"), request);
        assertEquals(409, res.getStatusCode().value());
        assertEquals("Already tracked", ((ApiExceptionHandler.ApiError) res.getBody()).message());
    }

    @Test
    void databaseAndUnexpectedErrorsDoNotLeakInternals() {
        var conflict = handler.handleConflict(
                new DataIntegrityViolationException("duplicate key violates constraint uq_commissions_user_source"));
        assertEquals(409, conflict.getStatusCode().value());
        assertFalse(conflict.getBody().message().contains("uq_commissions"));

        var crash = handler.handleUnexpected(new RuntimeException("password is hunter2"));
        assertEquals(500, crash.getStatusCode().value());
        assertEquals("Something went wrong", crash.getBody().message());
    }
}