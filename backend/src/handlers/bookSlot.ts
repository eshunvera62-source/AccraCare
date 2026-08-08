import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { z } from 'zod';
import { GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { PublishCommand, SNSClient } from '@aws-sdk/client-sns';
import { jsonResponse, errorResponse } from '../utils/response.js';
import { dynamoClient } from '../utils/dynamo.js';

const pathSchema = z.object({
  slotId: z.string().regex(/^[\w\-]{1,64}$/),
});

const payloadSchema = z.object({
  name: z.string().min(1).max(200),
  phone: z.string().min(1).max(50),
  email: z.string().email().max(200).optional(),
});

const snsClient = new SNSClient({});

export async function lambdaHandler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const slotsTable = process.env.SLOTS_TABLE;
  const bookingsTable = process.env.BOOKINGS_TABLE;
  const snsTopicArn = process.env.SNS_TOPIC_ARN;

  if (!slotsTable || !bookingsTable) {
    return errorResponse(500, 'Missing SLOTS_TABLE or BOOKINGS_TABLE configuration');
  }

  try {
    const pathParameters = pathSchema.parse({ slotId: event.pathParameters?.slotId });
    const body = payloadSchema.parse(JSON.parse(event.body ?? '{}'));
    const slotId = pathParameters.slotId;

    let updatedSlot = (
      await dynamoClient.send(
        new UpdateCommand({
          TableName: slotsTable,
          Key: { id: slotId },
          UpdateExpression:
            'SET availableSeats = availableSeats - :one, #s = if_not_exists(#s, :avail)',
          ConditionExpression: 'attribute_exists(id) AND availableSeats > :zero',
          ExpressionAttributeNames: { '#s': 'status' },
          ExpressionAttributeValues: { ':one': 1, ':zero': 0, ':avail': 'available' },
          ReturnValues: 'ALL_NEW',
        }),
      )
    ).Attributes as Record<string, unknown>;

    if (Number(updatedSlot.availableSeats ?? 0) <= 0 && updatedSlot.status !== 'full') {
      updatedSlot = (
        await dynamoClient.send(
          new UpdateCommand({
            TableName: slotsTable,
            Key: { id: slotId },
            UpdateExpression: 'SET #s = :full',
            ExpressionAttributeNames: { '#s': 'status' },
            ExpressionAttributeValues: { ':full': 'full' },
            ReturnValues: 'ALL_NEW',
          }),
        )
      ).Attributes as Record<string, unknown>;
    }

    const confirmationCode = `ACC-${Math.floor(Math.random() * 900000) + 100000}`;
    const booking = {
      id: `bk-${crypto.randomUUID().slice(0, 8)}`,
      confirmationCode,
      slotId,
      patientName: body.name,
      patientPhone: body.phone,
      patientEmail: body.email ?? '',
      bookedAt: Date.now(),
      ttl: Math.floor(Date.now() / 1000) + 365 * 24 * 3600,
      status: 'confirmed',
    };

    await dynamoClient.send(
      new PutCommand({
        TableName: bookingsTable,
        Item: booking,
        ConditionExpression: 'attribute_not_exists(id)',
      }),
    );

    if (snsTopicArn) {
      try {
        await snsClient.send(
          new PublishCommand({
            TopicArn: snsTopicArn,
            Subject: 'AccraCare booking confirmed',
            Message: `Booking confirmed for ${booking.patientName} on slot ${slotId}. Confirmation: ${confirmationCode}.`,
          }),
        );
      } catch {
        // Do not block a successful booking on notification failure.
      }
    }

    return jsonResponse(200, { success: true, booking, updatedSlot });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonResponse(400, {
        success: false,
        error: 'Invalid booking payload',
        details: error.issues,
      });
    }

    if ((error as Error).name === 'ConditionalCheckFailedException') {
      const currentSlot = await dynamoClient.send(
        new GetCommand({
          TableName: process.env.SLOTS_TABLE ?? '',
          Key: { id: event.pathParameters?.slotId },
        }),
      );
      return jsonResponse(409, {
        success: false,
        error: 'SLOT_JUST_FILLED',
        updatedSlot: currentSlot.Item ?? null,
      });
    }

    return errorResponse(500, 'Failed to book slot', { message: (error as Error).message });
  }
}
