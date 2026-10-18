export class ApiaryError extends Error {}

export class JobNotFoundError extends ApiaryError {}

export class DuplicateJobError extends ApiaryError {}

export class JobCancelledError extends ApiaryError {}

export class JobTimeoutError extends ApiaryError {}

export class UnknownJobError extends ApiaryError {}

export class LockUnavailableError extends ApiaryError {}

export class CronExpressionError extends ApiaryError {}
