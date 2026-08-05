import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { jsonResponse, errorResponse } from '../utils/response.js';
import { dynamoClient } from '../utils/dynamo.js';
import { z } from 'zod';
const schema = z.object({
    name: z.string().min(3).max(200),
    specialty: z.string().min(3).max(200),
    hospital: z.string().min(3).max(200),
    email: z.string().email().max(200).optional(),
    description: z.string().max(500).optional()
});
export async function lambdaHandler(event) {
    try {
        const body = schema.parse(JSON.parse(event.body ?? '{}'));
        const doctorId = `doc-${crypto.randomUUID().slice(0, 8)}`;
        const now = new Date().toISOString();
        const item = {
            doctorId,
            ...body,
            createdAt: now,
            updatedAt: now
        };
        await dynamoClient.send(new PutCommand({
            TableName: process.env.DOCTORS_TABLE ?? '',
            Item: item,
            ConditionExpression: 'attribute_not_exists(doctorId)'
        }));
        return jsonResponse(201, item);
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            return errorResponse(400, 'Validation failed', { issues: error.issues });
        }
        return errorResponse(500, 'Failed to create doctor', { message: error.message });
    }
}
