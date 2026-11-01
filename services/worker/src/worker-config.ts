export interface AwsWorkerConfig {
  region: "ap-northeast-1";
  jobsTableName: string;
  twelveDataApiKey: string;
  bedrockModelId: string;
  bedrockMaxOutputTokens: number;
}

function required(value: string | undefined, field: string): string {
  if (!value?.trim()) throw new Error(`${field} is required.`);
  return value.trim();
}

export function parseAwsWorkerConfig(environment: Record<string, string | undefined>): AwsWorkerConfig {
  const region = required(environment.AWS_REGION, "AWS_REGION");
  if (region !== "ap-northeast-1") throw new Error("AWS_REGION must be ap-northeast-1.");
  const jobsTableName = required(environment.JOBS_TABLE_NAME, "JOBS_TABLE_NAME");
  if (!/^[A-Za-z0-9_.-]{3,255}$/.test(jobsTableName)) throw new Error("JOBS_TABLE_NAME is invalid.");
  const twelveDataApiKey = required(environment.TWELVE_DATA_API_KEY, "TWELVE_DATA_API_KEY");
  if (twelveDataApiKey.length < 8 || twelveDataApiKey.length > 256) throw new Error("TWELVE_DATA_API_KEY has an invalid length.");
  const bedrockModelId = required(environment.BEDROCK_MODEL_ID, "BEDROCK_MODEL_ID");
  if (!/^[A-Za-z0-9._:-]{1,160}$/.test(bedrockModelId)) throw new Error("BEDROCK_MODEL_ID is invalid.");
  const parsedMaxTokens = environment.BEDROCK_MAX_OUTPUT_TOKENS === undefined
    ? 512
    : Number(environment.BEDROCK_MAX_OUTPUT_TOKENS);
  if (!Number.isInteger(parsedMaxTokens) || parsedMaxTokens < 128 || parsedMaxTokens > 512) {
    throw new Error("BEDROCK_MAX_OUTPUT_TOKENS must be an integer from 128 through 512.");
  }
  return {
    region,
    jobsTableName,
    twelveDataApiKey,
    bedrockModelId,
    bedrockMaxOutputTokens: parsedMaxTokens,
  };
}
