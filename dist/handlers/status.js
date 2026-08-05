import { jsonResponse } from '../utils/response.js';
export async function lambdaHandler(_) {
    return jsonResponse(200, {
        service: 'AccraCare',
        version: '1.0.0',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
}
