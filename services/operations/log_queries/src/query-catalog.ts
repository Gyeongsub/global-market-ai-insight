export type ProjectLogGroup = "apiAccess" | "controller" | "worker";

export interface ProjectLogGroups {
  apiAccess: string;
  controller: string;
  worker: string;
}

export interface DiagnosticQuery {
  name: string;
  purpose: string;
  logGroups: string[];
  query: string;
  suggestedLookbackMinutes: number;
  maximumRows: number;
}

const PROJECT_PATTERN = /^[a-z][a-z0-9-]{2,48}$/;
const ENVIRONMENT_PATTERN = /^[a-z][a-z0-9-]{1,15}$/;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,100}$/;
const JOB_ID_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

export function projectLogGroups(projectName: string, environment: string): ProjectLogGroups {
  if (!PROJECT_PATTERN.test(projectName) || !ENVIRONMENT_PATTERN.test(environment)) {
    throw new Error("Project log-group identity is invalid.");
  }
  const prefix = `${projectName}-${environment}`;
  return {
    apiAccess: `/aws/apigateway/${prefix}-api-access`,
    controller: `/aws/lambda/${prefix}-controller`,
    worker: `/aws/ecs/${prefix}/worker`,
  };
}

function exactIdentifier(value: string, pattern: RegExp, label: string): string {
  if (!pattern.test(value)) throw new Error(`${label} is invalid.`);
  return value;
}

function query(
  name: string,
  purpose: string,
  logGroups: string[],
  lines: string[],
  maximumRows: number,
): DiagnosticQuery {
  return {
    name,
    purpose,
    logGroups,
    query: [...lines, `limit ${maximumRows}`].join("\n"),
    suggestedLookbackMinutes: 15,
    maximumRows,
  };
}

/**
 * Read-only Logs Insights query plans. Creating a plan performs no AWS call.
 * The caller must separately choose a bounded time range before running one.
 */
export function diagnosticQueryCatalog(groups: ProjectLogGroups): DiagnosticQuery[] {
  return [
    query(
      "api-status-summary",
      "Count bounded API responses by route and status without reading request bodies.",
      [groups.apiAccess],
      [
        "fields routeKey, status",
        "filter ispresent(routeKey) and ispresent(status)",
        "stats count(*) as responses by routeKey, status",
        "sort responses desc",
      ],
      20,
    ),
    query(
      "controller-failure-summary",
      "Count sanitized controller failures by stable code.",
      [groups.controller],
      [
        "fields code, publicCode, dependencyCode, httpStatus",
        "filter service = 'controller' and (level = 'warn' or level = 'error')",
        "stats count(*) as failures by code, publicCode, dependencyCode, httpStatus",
        "sort failures desc",
      ],
      20,
    ),
    query(
      "worker-failure-summary",
      "Count sanitized worker failures without displaying raw messages or provider output.",
      [groups.worker],
      [
        "fields errorCode, diagnosticCategory",
        "filter service = 'worker' and status = 'FAILED'",
        "stats count(*) as failures by errorCode, diagnosticCategory",
        "sort failures desc",
      ],
      20,
    ),
  ];
}

export function requestTraceQuery(groups: ProjectLogGroups, requestId: string): DiagnosticQuery {
  const safe = exactIdentifier(requestId, REQUEST_ID_PATTERN, "Request ID");
  return query(
    "request-trace",
    "Trace one exact API request across access and controller logs.",
    [groups.apiAccess, groups.controller],
    [
      "fields @timestamp, service, level, code, dependencyCode, jobId, operation, routeKey, status, responseLength",
      `filter requestId = '${safe}'`,
      "sort @timestamp asc",
    ],
    50,
  );
}

export function jobTraceQuery(groups: ProjectLogGroups, jobId: string): DiagnosticQuery {
  const safe = exactIdentifier(jobId, JOB_ID_PATTERN, "Job ID");
  return query(
    "job-trace",
    "Trace one exact job across sanitized controller and worker lifecycle logs.",
    [groups.controller, groups.worker],
    [
      "fields @timestamp, service, level, code, status, operation, errorCode, diagnosticCategory, durationMs",
      `filter jobId = '${safe}'`,
      "sort @timestamp asc",
    ],
    50,
  );
}
