import { jsonResponse } from '../utils/response.js';
export async function lambdaHandler(_) {
    return jsonResponse(200, { status: 'ok', timestamp: new Date().toISOString() });
}
