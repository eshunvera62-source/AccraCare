import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import { jsonResponse, errorResponse } from '../utils/response.js';
import { dynamoClient } from '../utils/dynamo.js';

const schema = z.object({
  hospitalName: z.string().min(1).max(200),
  area: z.string().min(1).max(200),
  department: z.string().min(1).max(200),
  doctorName: z.string().min(1).max(200),
  doctorTitle: z.string().max(200).optional(),
  dateTime: z.string().min(1).max(100),
  totalSeats: z.number().int().min(1).max(100),
  consultationFee: z.string().max(100).optional()
});

export async function lambdaHandler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const tableName = process.env.SLOTS_TABLE;
  if (!tableName) {
    return errorResponse(500, 'Missing SLOTS_TABLE configuration');
  }

  try {
    const body = schema.parse(JSON.parse(event.body ?? '{}'));
    const slotId = `slot-acc-${crypto.randomUUID().slice(0, 8)}`;
    const now = Date.now();

    const item = {
      id: slotId,
      hospitalName: body.hospitalName,
      area: body.area,
      department: body.department,
      doctorName: body.doctorName,
      doctorTitle: body.doctorTitle ?? 'Specialist Consultant',
      dateTime: body.dateTime,
      availableSeats: body.totalSeats,
      totalSeats: body.totalSeats,
      status: body.totalSeats > 0 ? 'available' : 'full',
      consultationFee: body.consultationFee ?? 'GHS 150',
      createdAt: now
    };

    await dynamoClient.send(
      new PutCommand({
        TableName: tableName,
        Item: item,
        ConditionExpression: 'attribute_not_exists(id)'
      })
    );

    return jsonResponse(201, item);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(400, 'Invalid slot payload', { issues: error.issues });
    }
    return errorResponse(500, 'Failed to create slot', { message: (error as Error).message });
  }
}
