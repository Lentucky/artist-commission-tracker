package com.commissiontracker.controller;

import java.util.LinkedHashMap;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.ErrorResponse;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

/**
 * Every error leaves the API as {"status": 409, "message": "...", "fields": {}}.
 * Extending ResponseEntityExceptionHandler routes Spring's own errors (bad JSON, wrong method,
 * unknown path, bad parameter type) and our ResponseStatusExceptions through the same shape.
 */
@RestControllerAdvice
public class ApiExceptionHandler extends ResponseEntityExceptionHandler {
    public record ApiError(int status, String message, Map<String, String> fields) {}

    private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

    @Override
    protected ResponseEntity<Object> handleExceptionInternal(Exception ex, Object body, HttpHeaders headers,
                                                             HttpStatusCode status, WebRequest request) {
        ProblemDetail pd = body instanceof ProblemDetail p ? p : ex instanceof ErrorResponse er ? er.getBody() : null;
        String message = pd != null && pd.getDetail() != null
                ? pd.getDetail()
                : HttpStatus.valueOf(status.value()).getReasonPhrase();
        return ResponseEntity.status(status).headers(headers).body(new ApiError(status.value(), message, Map.of()));
    }

    @Override
    protected ResponseEntity<Object> handleMethodArgumentNotValid(MethodArgumentNotValidException ex, HttpHeaders headers,
                                                                  HttpStatusCode status, WebRequest request) {
        Map<String, String> fields = new LinkedHashMap<>();
        ex.getBindingResult().getFieldErrors().forEach(f -> fields.putIfAbsent(f.getField(), f.getDefaultMessage()));
        return ResponseEntity.status(status).headers(headers).body(new ApiError(status.value(), "Validation failed", fields));
    }

    // e.g. two scans racing past the duplicate check and hitting the unique index; never echo SQL details to the client
    @ExceptionHandler(DataIntegrityViolationException.class)
    ResponseEntity<ApiError> handleConflict(DataIntegrityViolationException ex) {
        log.warn("Data integrity violation: {}", ex.getMostSpecificCause().getMessage());
        return ResponseEntity.status(HttpStatus.CONFLICT).body(new ApiError(409, "Already exists", Map.of()));
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<ApiError> handleUnexpected(Exception ex) {
        log.error("Unhandled error", ex);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(new ApiError(500, "Something went wrong", Map.of()));
    }
}