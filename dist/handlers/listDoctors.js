import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { jsonResponse, errorResponse } from '../utils/response.js';
import { dynamoClient } from '../utils/dynamo.js';
export async function lambdaHandler(_) {
    try {
        const result = await dynamoClient.send(new ScanCommand({ TableName: process.env.DOCTORS_TABLE ?? '' }));
        return jsonResponse(200, {
            doctors: result.Items ?? []
        });
    }
    catch (error) {
        return errorResponse(500, 'Failed to list doctors', { message: error.message });
    }
}
