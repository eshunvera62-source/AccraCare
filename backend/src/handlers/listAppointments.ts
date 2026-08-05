import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { jsonResponse, errorResponse } from '../utils/response.js';
import { dynamoClient } from '../utils/dynamo.js';

export async function lambdaHandler(_: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const result = await dynamoClient.send(
      new ScanCommand({ TableName: process.env.APPOINTMENTS_TABLE ?? '' })
    );

    return jsonResponse(200, { appointments: result.Items ?? [] });
  } catch (error) {
    return errorResponse(500, 'Failed to list appointments', { message: (error as Error).message });
  }
}
