import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { jsonResponse, errorResponse } from '../utils/response.js';
import { dynamoClient } from '../utils/dynamo.js';
import { z } from 'zod';
const paramsSchema = z.object({
    email: z.string().email().max(200)
});
export async function lambdaHandler(event) {
    try {
        const pathParameters = paramsSchema.parse({ email: event.pathParameters?.email });
        const result = await dynamoClient.send(new QueryCommand({
            TableName: process.env.APPOINTMENTS_TABLE ?? '',
            IndexName: 'patientEmail-index',
            KeyConditionExpression: 'patientEmail = :email',
            ExpressionAttributeValues: { ':email': pathParameters.email }
        }));
        return jsonResponse(200, { appointments: result.Items ?? [] });
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            return errorResponse(400, 'Validation failed', { issues: error.issues });
        }
        return errorResponse(500, 'Could not retrieve appointments', { message: error.message });
    }
}
