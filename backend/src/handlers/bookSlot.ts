/**
 * bookSlot.ts
 * ---------------------------------------------------------------------------
 * POST /slots/{slotId}/book
 * Atomically books one seat on a slot and records the booking.
 *
 * SECURITY NOTES:
 * 1. The confirmation code is generated using `crypto.randomInt` (cryptographically
 *    secure) rather than `Math.random()` which is predictable and forgeable.
 * 2. The DynamoDB conditional update (`availableSeats > :zero`) prevents the
 *    race condition where two patients book the last seat simultaneously.
 * 3. All user-supplied fields are validated with Zod and length-capped.
 * ---------------------------------------------------------------------------
 */

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { randomInt, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { PublishCommand, SNSClient } from '@aws-sdk/client-sns';
import { jsonResponse, errorResponse } from '../utils/response.js';
import { dynamoClient } from '../utils/dynamo.js';

/** Zod schema validating the slot ID path parameter. */
const pathSchema = z.object({
  slotId: z.string().regex(/^[\w-]{1,64}$/),
});

/** Zod schema validating the patient booking payload. */
const payloadSchema = z.object({
  name: z.string().min(1).max(200),
  phone: z.string().min(1).max(50),
  email: z.string().email().max(200).optional(),
});

const snsClient = new SNSClient({});

/**
 * Generates a cryptographically secure 6-digit confirmation code.
 *
 * Uses `crypto.randomInt` (CSPRNG-backed) instead of `Math.random()`
 * which is predictable and could allow an attacker to forge codes.
 *
 * @returns A confirmation code in the format `ACC-XXXXXX`.
 */
function generateConfirmationCode(): string {
  const code = randomInt(100000, 1000000);
  return `ACC-${code}`;
}

/**
 * Lambda handler for booking a slot.
 *
 * @param event - API Gateway proxy event.
 * @returns 200 with booking details, 400 on validation failure,
 *          409 if the slot just filled, or 500 on unexpected error.
 */
export async function lambdaHandler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const slotsTable = process.env.SLOTS_TABLE;
  const bookingsTable = process.env.BOOKINGS_TABLE;
  const snsTopicArn = process.env.SNS_TOPIC_ARN;

  if (!slotsTable || !bookingsTable) {
    return errorResponse(500, 'Missing SLOTS_TABLE or BOOKINGS_TABLE configuration', undefined, event);
  }

  try {
    const pathParameters = pathSchema.parse({ slotId: event.pathParameters?.slotId });
    const body = payloadSchema.parse(JSON.parse(event.body ?? '{}'));
    const slotId = pathParameters.slotId;

    // Atomically decrement availableSeats — this is what prevents the
    // race condition where two patients book the last seat simultaneously.
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

    // If seats hit zero, flip status to full.
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

    const confirmationCode = generateConfirmationCode();
    const booking = {
      id: `bk-${randomUUID().slice(0, 8)}`,
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

    // Send SNS notification — never block a successful booking on failure.
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
        // Notification failure should never block a successful booking.
      }
    }

    return jsonResponse(200, { success: true, booking, updatedSlot }, event);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonResponse(400, {
        success: false,
        error: 'Invalid booking payload',
        details: error.issues,
      }, event);
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
      }, event);
    }

    // Do NOT leak internal error details to the client.
    return errorResponse(500, 'Failed to book slot', undefined, event);
  }
}