"use strict";

const AWS = require("aws-sdk");

module.exports.status = async (event, context, callback) => {
  const sensorId =
    event.queryStringParameters && event.queryStringParameters["sensorId"];
  let result = undefined;

  if (sensorId) {
    const dynamoDb = new AWS.DynamoDB.DocumentClient();

    const params = {
      TableName: process.env.DYNAMODB_TABLE,
      ProjectionExpression: "ts, temperature",
      ScanIndexForward: false,
      Limit: 1,
      KeyConditionExpression: "sensorId = :s",
      ExpressionAttributeValues: {
        ":s": sensorId
      }
    };

    result = await dynamoDb.query(params).promise();
  }

  console.log(`items for ${sensorId}`, result ? result.Items : null);
  const latestItem = result && result.Items[0] ? { ...result.Items[0] } : null;
  const response = {
    statusCode: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Credentials": true
    },
    body: JSON.stringify({
      latestItem: latestItem,
      config: {
        maxAddBatchSize: 500
      }
    })
  };
  callback(null, response);
};

// module.exports.all = async (event, context, callback) => {
//   const dynamoDb = new AWS.DynamoDB.DocumentClient();

//   const params = {
//     TableName: process.env.DYNAMODB_TABLE,
//   };

//   const result = await dynamoDb.scan(params).promise();

//   const response = {
//     statusCode: 200,
//     headers: {
//       'Access-Control-Allow-Origin': '*',
//       'Access-Control-Allow-Credentials': true,
//     },
//     body: JSON.stringify({
//       items: result.Items,
//     }),
//   };
//   callback(null, response);
// };

const chunkArray = (myArray, chunkSize) => {
  var results = [];

  while (myArray.length) {
    results.push(myArray.splice(0, chunkSize));
  }

  return results;
};

module.exports.add = async (event, context, callback) => {
  console.log("Received event:", JSON.stringify(event, null, 2));

  const dynamoDb = new AWS.DynamoDB();

  const dataIn = JSON.parse(event.body);

  // Write oldest first because if writing fails, we have have continuous data from
  // oldest to newest and the status endpoint will return correct results
  const itemsSortedOldestFirst = dataIn.items.sort((a, b) =>
    a.ts.localeCompare(b.ts)
  );
  console.log(`Received ${itemsSortedOldestFirst.length} items.`);

  const chunkSize = 25; // AWS limit for batchWriteItem

  for (const arr of chunkArray(itemsSortedOldestFirst, chunkSize)) {
    const items = arr.map(e => ({
      PutRequest: {
        Item: {
          sensorId: { S: dataIn.sensorId },
          ts: { S: e.ts },
          temperature: { S: e.temperature }
        }
      }
    }));

    const params = {
      RequestItems: {
        [process.env.DYNAMODB_TABLE]: items
      }
    };

    await dynamoDb.batchWriteItem(params).promise();
    console.log(`Added ${items.length} items to ${dataIn.sensorId}.`);
  }

  const response = {
    statusCode: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Credentials": true
    }
  };
  callback(null, response);
};

module.exports.addOne = async (event, context, callback) => {
  console.log("Received event:", JSON.stringify(event, null, 2));

  const dynamoDb = new AWS.DynamoDB();

  const dataIn = JSON.parse(event.body);

  const params = {
    Item: {
      sensorId: { S: dataIn.sensorId },
      ts: { S: dataIn.ts },
      temperature: { S: dataIn.temperature }
    },
    TableName: process.env.DYNAMODB_TABLE
  };

  await dynamoDb.putItem(params).promise();
  console.log("Added item:", params);

  const response = {
    statusCode: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Credentials": true
    }
  };
  callback(null, response);
};
