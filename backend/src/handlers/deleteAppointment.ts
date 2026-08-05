import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { jsonResponse, errorResponse } from '../utils/response.js';
import { dynamoClient } from '../utils/dynamo.js';
import { z } from 'zod';

const paramsSchema = z.object({
  id: z.string().min(3).max(100)
});

export async function lambdaHandler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const pathParameters = paramsSchema.parse({ id: event.pathParameters?.id });

    await dynamoClient.send(
      new DeleteCommand({
        TableName: process.env.APPOINTMENTS_TABLE ?? '',
        Key: { appointmentId: pathParameters.id },
        ConditionExpression: 'attribute_exists(appointmentId)'
      })
    );

    return jsonResponse(200, { deleted: true, appointmentId: pathParameters.id });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(400, 'Validation failed', { issues: error.issues });
    }
    return errorResponse(500, 'Could not delete appointment', { message: (error as Error).message });
  }
}
