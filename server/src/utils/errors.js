class AppError extends Error {
    constructor(message, status = 500, code = 'INTERNAL_ERROR') {
        super(message);
        this.status = status;
        this.code = code;
        this.expose = status < 500;
    }
}

class ValidationError extends AppError {
    constructor(message = 'Validation failed', details) {
        super(message, 400, 'VALIDATION');
        this.details = details;
    }
}

class AuthError extends AppError {
    constructor(message = 'Authentication required') {
        super(message, 401, 'AUTH');
    }
}

class ForbiddenError extends AppError {
    constructor(message = 'Insufficient permissions') {
        super(message, 403, 'FORBIDDEN');
    }
}

class NotFoundError extends AppError {
    constructor(message = 'Resource not found') {
        super(message, 404, 'NOT_FOUND');
    }
}

module.exports = {
    AppError,
    ValidationError,
    AuthError,
    ForbiddenError,
    NotFoundError,
};
