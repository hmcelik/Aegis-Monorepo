import * as tokenService from '../services/tokenService.js';
import ApiError from '../utils/apiError.js';

export const checkJwt = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return next(new ApiError(401, 'No token provided.'));
    }

    try {
        const decoded = tokenService.verifyToken(token);
        req.user = decoded;
        next();
    } catch (err) {
        return next(new ApiError(401, 'Invalid or expired token.'));
    }
};