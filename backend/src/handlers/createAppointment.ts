import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { jsonResponse, errorResponse } from '../utils/response.js';
import { dynamoClient } from '../utils/dynamo.js';
import { z } from 'zod';

const payloadSchema = z.object({
  doctorId: z.string().min(3).max(100),
  patientEmail: z.string().email().max(200),
  patientName: z.string().min(3).max(200),
  appointmentTime: z.string().min(1).max(100),
  reason: z.string().max(500).optional(),
  notes: z.string().max(500).optional()
});

export async function lambdaHandler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const body = payloadSchema.parse(JSON.parse(event.body ?? '{}'));
    const appointmentId = `appt-${crypto.randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();

    const appointment = {
      appointmentId,
      ...body,
      status: 'scheduled',
      createdAt: now,
      updatedAt: now,
      ttl: Math.floor(Date.now() / 1000) + 30 * 24 * 3600
    };

    await dynamoClient.send(
      new PutCommand({
        TableName: process.env.APPOINTMENTS_TABLE ?? '',
        Item: appointment,
        ConditionExpression: 'attribute_not_exists(appointmentId)'
      })
    );

    return jsonResponse(201, appointment);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(400, 'Validation failed', { issues: error.issues });
    }
    return errorResponse(500, 'Could not create appointment', { message: (error as Error).message });
  }
}
