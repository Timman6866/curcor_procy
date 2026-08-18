export function connectError(code: string, message: string, httpStatus = 200) {
  return {
    httpStatus,
    body: { code, message },
  };
}

export function connectErrorFromUnknown(error: unknown) {
  const statusCode =
    typeof error === "object" && error && "statusCode" in error && typeof error.statusCode === "number"
      ? error.statusCode
      : 500;
  const message = error instanceof Error ? error.message : "Internal server error";

  if (statusCode === 401) {
    return connectError("unauthenticated", message);
  }
  if (statusCode === 404) {
    return connectError("not_found", message);
  }
  if (statusCode === 400) {
    return connectError("invalid_argument", message);
  }
  return connectError("internal", message);
}
