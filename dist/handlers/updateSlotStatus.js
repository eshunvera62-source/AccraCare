import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { jsonResponse, errorResponse } from '../utils/response.js';
import { dynamoClient } from '../utils/dynamo.js';
import { z } from 'zod';
const pathSchema = z.object({
    slotId: z.string().regex(/^[\w\-]{1,64}$/)
});
const bodySchema = z.object({
    status: z.enum(['available', 'full'])
});
export async function lambdaHandler(event) {
    const tableName = process.env.SLOTS_TABLE;
    if (!tableName) {
        return errorResponse(500, 'Missing SLOTS_TABLE configuration');
    }
    try {
        const pathParameters = pathSchema.parse({ slotId: event.pathParameters?.slotId });
        const body = bodySchema.parse(JSON.parse(event.body ?? '{}'));
        const slotId = pathParameters.slotId;
        const currentItem = await dynamoClient.send(new GetCommand({ TableName: tableName, Key: { id: slotId } }));
        if (!currentItem.Item) {
            return jsonResponse(404, { error: 'Slot not found' });
        }
        const totalSeatsValue = currentItem.Item.totalSeats;
        const totalSeats = typeof totalSeatsValue === 'number'
            ? totalSeatsValue
            : parseInt(String(totalSeatsValue ?? ''), 10) || 1;
        const newAvailableSeats = body.status === 'full' ? 0 : totalSeats || 1;
        const updated = await dynamoClient.send(new UpdateCommand({
            TableName: tableName,
            Key: { id: slotId },
            UpdateExpression: 'SET availableSeats = :seats, #s = :status',
            ExpressionAttributeNames: { '#s': 'status' },
            ExpressionAttributeValues: { ':seats': newAvailableSeats, ':status': body.status },
            ReturnValues: 'ALL_NEW'
        }));
        return jsonResponse(200, updated.Attributes ?? {});
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            return errorResponse(400, 'Invalid slot status payload', { issues: error.issues });
        }
        return errorResponse(500, 'Failed to update slot status', { message: error.message });
    }
}
